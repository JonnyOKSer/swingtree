import type { Config, Context } from '@netlify/functions'
import { getPool } from './db.js'

/**
 * Auto-Reconcile: Scheduled Function
 *
 * Runs every 10 minutes, 24/7. Checks ESPN for recently completed matches,
 * matches them against unreconciled predictions in prediction_log, and
 * updates actual_winner and correct fields.
 */

const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

interface CompletedMatch {
  tournament: string
  round: string
  player1: string
  player2: string
  winner: string
  tour: 'ATP' | 'WTA'
}

function normalizeRound(roundName: string): string {
  const lower = roundName.toLowerCase()
  if (lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) return 'F'
  if (lower.includes('semifinal') || lower.includes('semi-final')) return 'SF'
  if (lower.includes('quarterfinal') || lower.includes('quarter-final')) return 'QF'
  if (lower.includes('round of 16') || lower.includes('round 4')) return 'R16'
  if (lower.includes('round of 32') || lower.includes('round 3')) return 'R32'
  if (lower.includes('round of 64') || lower.includes('round 2')) return 'R64'
  if (lower.includes('round of 128') || lower.includes('round 1')) return 'R128'
  return roundName.substring(0, 10)
}

function normalizePlayerName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+Jr\.?$/i, '')
    .replace(/\s+Sr\.?$/i, '')
    .replace(/\s+III$/i, '')
    .replace(/\s+II$/i, '')
    .trim()
    .toLowerCase()
}

function playersMatch(espnName: string, dbName: string): boolean {
  const normalized1 = normalizePlayerName(espnName)
  const normalized2 = normalizePlayerName(dbName)

  if (normalized1 === normalized2) return true

  const lastName1 = normalized1.split(' ').pop() || ''
  const lastName2 = normalized2.split(' ').pop() || ''
  if (lastName1 === lastName2 && lastName1.length > 2) return true

  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true

  return false
}

async function fetchCompletedMatches(tour: 'ATP' | 'WTA'): Promise<CompletedMatch[]> {
  const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`ESPN API returned ${response.status}`)

    const data = await response.json()
    const matches: CompletedMatch[] = []

    for (const event of data.events || []) {
      const tournamentName = event.name || 'Unknown'
      const singlesSlug = tour === 'ATP' ? 'mens-singles' : 'womens-singles'

      for (const grouping of event.groupings || []) {
        if (grouping.grouping?.slug !== singlesSlug) continue

        for (const comp of grouping.competitions || []) {
          if (!comp.status?.type?.completed) continue

          const roundName = comp.round?.displayName || 'Unknown'
          const competitors = comp.competitors || []
          if (competitors.length < 2) continue

          const player1 = competitors[0]?.athlete?.displayName || 'TBD'
          const player2 = competitors[1]?.athlete?.displayName || 'TBD'
          const winner = competitors.find((c: any) => c.winner)?.athlete?.displayName
          if (!winner) continue

          matches.push({
            tournament: tournamentName,
            round: normalizeRound(roundName),
            player1,
            player2,
            winner,
            tour
          })
        }
      }
    }

    return matches
  } catch (error) {
    console.error(`[AUTO-RECONCILE] ESPN ${tour} fetch error:`, error)
    return []
  }
}

export default async function handler(_request: Request, _context: Context) {
  const startTime = Date.now()
  console.log(`[AUTO-RECONCILE] Starting at ${new Date().toISOString()}`)

  try {
    const pool = getPool()

    // Check for unreconciled predictions first (quick exit if none)
    const unreconciledResult = await pool.query(`
      SELECT id, tournament, round, player_a, player_b, predicted_winner, tour
      FROM prediction_log
      WHERE actual_winner IS NULL
        AND prediction_date >= CURRENT_DATE - INTERVAL '7 days'
        AND confidence_tier != 'VOID'
      ORDER BY prediction_date DESC
    `)

    if (unreconciledResult.rows.length === 0) {
      console.log('[AUTO-RECONCILE] No unreconciled predictions, exiting')
      return new Response(JSON.stringify({
        success: true,
        message: 'No unreconciled predictions',
        checked: 0,
        updated: 0,
        duration: Date.now() - startTime
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    console.log(`[AUTO-RECONCILE] Found ${unreconciledResult.rows.length} unreconciled predictions`)

    // Fetch completed matches from ESPN
    const atpMatches = await fetchCompletedMatches('ATP')
    const wtaMatches = await fetchCompletedMatches('WTA')
    const allMatches = [...atpMatches, ...wtaMatches]

    console.log(`[AUTO-RECONCILE] ESPN: ${atpMatches.length} ATP + ${wtaMatches.length} WTA completed`)

    if (allMatches.length === 0) {
      console.log('[AUTO-RECONCILE] No completed matches from ESPN, exiting')
      return new Response(JSON.stringify({
        success: true,
        message: 'No completed matches from ESPN',
        checked: unreconciledResult.rows.length,
        updated: 0,
        duration: Date.now() - startTime
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Match predictions to results
    let updated = 0
    for (const pred of unreconciledResult.rows) {
      const matchingResult = allMatches.find(m => {
        // Tournament name matching
        const tournamentMatch =
          m.tournament.toLowerCase().includes(pred.tournament.toLowerCase()) ||
          pred.tournament.toLowerCase().includes(m.tournament.toLowerCase()) ||
          (m.tournament.toLowerCase().includes('indian wells') && pred.tournament.toLowerCase().includes('indian wells')) ||
          (m.tournament.toLowerCase().includes('bnp paribas') && pred.tournament.toLowerCase().includes('indian wells'))

        if (!tournamentMatch) return false
        if (m.round !== pred.round) return false
        if (m.tour !== (pred.tour || 'ATP')) return false

        const playersMatchOrder1 =
          playersMatch(m.player1, pred.player_a) && playersMatch(m.player2, pred.player_b)
        const playersMatchOrder2 =
          playersMatch(m.player1, pred.player_b) && playersMatch(m.player2, pred.player_a)

        return playersMatchOrder1 || playersMatchOrder2
      })

      if (matchingResult) {
        const correct = playersMatch(matchingResult.winner, pred.predicted_winner)

        await pool.query(`
          UPDATE prediction_log
          SET actual_winner = $1, correct = $2
          WHERE id = $3
        `, [matchingResult.winner, correct, pred.id])

        updated++
        console.log(`[AUTO-RECONCILE] ${correct ? '✓' : '✗'} ${pred.player_a} vs ${pred.player_b} → ${matchingResult.winner}`)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[AUTO-RECONCILE] Complete: ${updated}/${unreconciledResult.rows.length} reconciled in ${duration}ms`)

    return new Response(JSON.stringify({
      success: true,
      message: `Reconciled ${updated} of ${unreconciledResult.rows.length} predictions`,
      checked: unreconciledResult.rows.length,
      updated,
      duration
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[AUTO-RECONCILE] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

// Netlify scheduled function config - runs every 10 minutes
export const config: Config = {
  schedule: '*/10 * * * *'
}
