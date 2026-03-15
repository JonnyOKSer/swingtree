import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Reconcile Predictions
 *
 * Manual fallback to reconcile predictions with actual results when Railway Oracle is down.
 * This function:
 * 1. Fetches completed match results from ESPN API
 * 2. Matches them to predictions in prediction_log
 * 3. Updates actual_winner and correct fields
 *
 * Endpoint: POST /api/admin-reconcile
 */

const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

interface ESPNCompetitor {
  athlete?: {
    displayName?: string
  }
  winner?: boolean
}

interface ESPNCompetition {
  status?: {
    type?: {
      name?: string
      description?: string
      completed?: boolean
    }
  }
  round?: {
    displayName?: string
  }
  competitors?: ESPNCompetitor[]
}

interface ESPNGrouping {
  grouping?: {
    slug?: string
  }
  competitions?: ESPNCompetition[]
}

interface ESPNEvent {
  name?: string
  groupings?: ESPNGrouping[]
}

interface ESPNResponse {
  events?: ESPNEvent[]
}

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
  // Remove common suffixes and normalize
  return name
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical info
    .replace(/\s+Jr\.?$/i, '')
    .replace(/\s+Sr\.?$/i)
    .replace(/\s+III$/i, '')
    .replace(/\s+II$/i, '')
    .trim()
    .toLowerCase()
}

function playersMatch(espnName: string, dbName: string): boolean {
  const normalized1 = normalizePlayerName(espnName)
  const normalized2 = normalizePlayerName(dbName)

  // Exact match
  if (normalized1 === normalized2) return true

  // Last name match (for abbreviated first names like "J. Sinner" vs "Jannik Sinner")
  const lastName1 = normalized1.split(' ').pop() || ''
  const lastName2 = normalized2.split(' ').pop() || ''
  if (lastName1 === lastName2 && lastName1.length > 2) return true

  // One contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true

  return false
}

async function fetchCompletedMatches(tour: 'ATP' | 'WTA'): Promise<CompletedMatch[]> {
  const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`ESPN API returned ${response.status}`)

    const data: ESPNResponse = await response.json()
    const matches: CompletedMatch[] = []

    for (const event of data.events || []) {
      const tournamentName = event.name || 'Unknown'
      const singlesSlug = tour === 'ATP' ? 'mens-singles' : 'womens-singles'

      for (const grouping of event.groupings || []) {
        if (grouping.grouping?.slug !== singlesSlug) continue

        for (const comp of grouping.competitions || []) {
          // Only get completed matches
          const status = comp.status?.type
          if (!status?.completed) continue

          const roundName = comp.round?.displayName || 'Unknown'
          const competitors = comp.competitors || []
          if (competitors.length < 2) continue

          const player1 = competitors[0]?.athlete?.displayName || 'TBD'
          const player2 = competitors[1]?.athlete?.displayName || 'TBD'

          // Find the winner
          const winner = competitors.find(c => c.winner)?.athlete?.displayName
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
    console.error(`ESPN ${tour} fetch error:`, error)
    return []
  }
}

async function reconcilePredictions(pool: ReturnType<typeof getPool>): Promise<{
  checked: number
  updated: number
  details: string[]
}> {
  const details: string[] = []
  let checked = 0
  let updated = 0

  // Fetch completed matches from ESPN
  const atpMatches = await fetchCompletedMatches('ATP')
  const wtaMatches = await fetchCompletedMatches('WTA')
  const allMatches = [...atpMatches, ...wtaMatches]

  console.log(`[RECONCILE] Found ${atpMatches.length} ATP + ${wtaMatches.length} WTA completed matches`)
  details.push(`ESPN: ${atpMatches.length} ATP + ${wtaMatches.length} WTA completed`)

  // Get unreconciled predictions from the last 7 days
  const unreconciledResult = await pool.query(`
    SELECT id, tournament, round, player_a, player_b, predicted_winner, tour
    FROM prediction_log
    WHERE actual_winner IS NULL
      AND prediction_date >= CURRENT_DATE - INTERVAL '7 days'
      AND confidence_tier != 'VOID'
    ORDER BY prediction_date DESC
  `)

  console.log(`[RECONCILE] Found ${unreconciledResult.rows.length} unreconciled predictions`)
  details.push(`Unreconciled predictions: ${unreconciledResult.rows.length}`)

  for (const pred of unreconciledResult.rows) {
    checked++

    // Try to find a matching completed match
    const matchingResult = allMatches.find(m => {
      // Tournament name should be similar
      const tournamentMatch =
        m.tournament.toLowerCase().includes(pred.tournament.toLowerCase()) ||
        pred.tournament.toLowerCase().includes(m.tournament.toLowerCase()) ||
        // Common tournament name variations
        (m.tournament.toLowerCase().includes('indian wells') && pred.tournament.toLowerCase().includes('indian wells')) ||
        (m.tournament.toLowerCase().includes('bnp paribas') && pred.tournament.toLowerCase().includes('indian wells'))

      if (!tournamentMatch) return false

      // Round should match
      if (m.round !== pred.round) return false

      // Tour should match
      if (m.tour !== (pred.tour || 'ATP')) return false

      // Players should match (in either order)
      const playersMatchOrder1 =
        playersMatch(m.player1, pred.player_a) && playersMatch(m.player2, pred.player_b)
      const playersMatchOrder2 =
        playersMatch(m.player1, pred.player_b) && playersMatch(m.player2, pred.player_a)

      return playersMatchOrder1 || playersMatchOrder2
    })

    if (matchingResult) {
      // Determine if prediction was correct
      const correct = playersMatch(matchingResult.winner, pred.predicted_winner)

      // Update the prediction
      await pool.query(`
        UPDATE prediction_log
        SET actual_winner = $1,
            correct = $2
        WHERE id = $3
      `, [matchingResult.winner, correct, pred.id])

      updated++
      const resultStr = correct ? '✓' : '✗'
      details.push(`${resultStr} ${pred.round}: ${pred.player_a} vs ${pred.player_b} → ${matchingResult.winner}`)
      console.log(`[RECONCILE] Updated: ${pred.player_a} vs ${pred.player_b} (${pred.round}) → ${matchingResult.winner} (${correct ? 'correct' : 'wrong'})`)
    }
  }

  return { checked, updated, details }
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Check admin session
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session || !session.isAdmin) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Admin access required' })
    }
  }

  console.log(`[ADMIN] Reconciliation initiated by ${session.email}`)

  try {
    const pool = getPool()
    const result = await reconcilePredictions(pool)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Reconciled ${result.updated} of ${result.checked} predictions`,
        checked: result.checked,
        updated: result.updated,
        details: result.details
      })
    }
  } catch (error) {
    console.error('[ADMIN] Reconcile error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', details: String(error) })
    }
  }
}
