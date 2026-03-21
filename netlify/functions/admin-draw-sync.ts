import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Draw Sync Status & Manual Trigger
 *
 * GET: Fetch draw_sync_log status
 * POST: Trigger manual draw sync from ESPN
 *
 * Endpoint: /api/admin-draw-sync
 */

const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

interface SyncLogEntry {
  id: number
  synced_at: string
  source: string
  matches_synced: number
  tournaments_synced: number | null
  active_tournaments_expected: number | null
  errors: string[] | null
  success: boolean
}

interface DrawSyncStatus {
  recent_syncs: SyncLogEntry[]
  last_successful: string | null
  draw_matches_count: number
  active_tournaments: number
  status: 'healthy' | 'stale' | 'error'
}

async function getDrawSyncStatus(pool: ReturnType<typeof getPool>): Promise<DrawSyncStatus> {
  // Check if draw_sync_log table exists
  let recentSyncs: SyncLogEntry[] = []
  let lastSuccessful: string | null = null

  try {
    // Get recent sync logs
    const logResult = await pool.query(`
      SELECT id, synced_at, source, matches_synced, tournaments_synced,
             active_tournaments_expected, errors, success
      FROM draw_sync_log
      ORDER BY synced_at DESC
      LIMIT 10
    `)
    recentSyncs = logResult.rows

    // Get last successful sync
    const lastSuccessResult = await pool.query(`
      SELECT synced_at FROM draw_sync_log
      WHERE success = true
      ORDER BY synced_at DESC
      LIMIT 1
    `)
    if (lastSuccessResult.rows.length > 0) {
      lastSuccessful = lastSuccessResult.rows[0].synced_at
    }
  } catch {
    // Table may not exist yet
    console.log('[draw-sync] draw_sync_log table not found')
  }

  // Get draw_matches count for today
  const drawCountResult = await pool.query(`
    SELECT COUNT(*) as count FROM draw_matches
    WHERE scheduled_date >= CURRENT_DATE - INTERVAL '1 day'
  `)
  const drawMatchesCount = parseInt(drawCountResult.rows[0]?.count || '0', 10)

  // Get active tournaments count
  let activeTournaments = 0
  try {
    const activeResult = await pool.query(`
      SELECT COUNT(*) as count FROM tournaments
      WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
    `)
    activeTournaments = parseInt(activeResult.rows[0]?.count || '0', 10)
  } catch {
    // tournaments table may not exist
  }

  // Determine overall status
  let status: 'healthy' | 'stale' | 'error' = 'healthy'

  if (activeTournaments > 0 && drawMatchesCount === 0) {
    status = 'error'
  } else if (lastSuccessful) {
    const lastSync = new Date(lastSuccessful)
    const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
    if (hoursSince > 2) {
      status = 'stale'
    }
  } else if (activeTournaments > 0) {
    status = 'stale'
  }

  return {
    recent_syncs: recentSyncs,
    last_successful: lastSuccessful,
    draw_matches_count: drawMatchesCount,
    active_tournaments: activeTournaments,
    status
  }
}

function normalizeRound(roundName: string): string {
  const lower = roundName.toLowerCase()
  if (lower.includes('qualifying')) return 'Q'
  if (lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) return 'F'
  if (lower.includes('semifinal') || lower.includes('semi-final')) return 'SF'
  if (lower.includes('quarterfinal') || lower.includes('quarter-final')) return 'QF'
  if (lower.includes('round of 16') || lower.includes('round 4')) return 'R16'
  if (lower.includes('round of 32') || lower.includes('round 3')) return 'R32'
  if (lower.includes('round of 64') || lower.includes('round 2')) return 'R64'
  if (lower.includes('round of 128') || lower.includes('round 1')) return 'R128'
  return roundName.substring(0, 10)
}

function normalizeTournamentName(name: string): string {
  // Strip year suffix if present
  let clean = name.replace(/\s+20\d{2}$/i, '').trim()

  // Known tournament name mappings
  const mappings: Record<string, string> = {
    'bnp paribas open': 'Indian Wells',
    'miami open presented by itau': 'Miami Open',
    'miami open': 'Miami Open',
    'rolex monte-carlo masters': 'Monte Carlo',
    'mutua madrid open': 'Madrid Open',
    'internazionali bnl d\'italia': 'Rome'
  }

  const lower = clean.toLowerCase()
  for (const [pattern, canonical] of Object.entries(mappings)) {
    if (lower.includes(pattern)) {
      return canonical
    }
  }

  return clean
}

async function triggerDrawSync(pool: ReturnType<typeof getPool>): Promise<{
  success: boolean
  matches_synced: number
  errors: string[]
}> {
  const errors: string[] = []
  let totalSynced = 0

  for (const tour of ['ATP', 'WTA'] as const) {
    const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL

    try {
      const response = await fetch(url)
      if (!response.ok) {
        errors.push(`ESPN ${tour} returned ${response.status}`)
        continue
      }

      const data = await response.json()
      const events = data.events || []

      for (const event of events) {
        const tournamentName = normalizeTournamentName(event.name || 'Unknown')
        const singlesSlug = tour === 'ATP' ? 'mens-singles' : 'womens-singles'

        for (const grouping of event.groupings || []) {
          if (grouping.grouping?.slug !== singlesSlug) continue

          for (const comp of grouping.competitions || []) {
            const competitors = comp.competitors || []
            if (competitors.length < 2) continue

            const player1 = competitors[0]?.athlete?.displayName
            const player2 = competitors[1]?.athlete?.displayName
            if (!player1 || !player2 || player1 === 'TBD' || player2 === 'TBD') continue

            const roundName = comp.round?.displayName || ''
            const round = normalizeRound(roundName)

            // Skip qualifying rounds
            if (round === 'Q') continue

            // Determine status
            const stateStr = comp.status?.type?.state || 'pre'
            let status = 'upcoming'
            if (stateStr === 'post') status = 'finished'
            else if (stateStr === 'in') status = 'live'

            // Build match key
            const players = [player1.toLowerCase(), player2.toLowerCase()].sort()
            const matchKey = `espn_${tournamentName.toLowerCase().replace(/\s+/g, '_')}_${round}_${players.join('_')}`

            // Find winner if finished
            let winnerName: string | null = null
            if (status === 'finished') {
              const winner = competitors.find((c: { winner?: boolean }) => c.winner)
              winnerName = winner?.athlete?.displayName || null
            }

            // Upsert to draw_matches
            await pool.query(`
              INSERT INTO draw_matches (
                match_key, tournament_key, tournament_name, tour,
                round_raw, round_normalized,
                player_1_key, player_1_name,
                player_2_key, player_2_name,
                scheduled_date, status, winner_name, draw_synced_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
              )
              ON CONFLICT (match_key) DO UPDATE SET
                status = EXCLUDED.status,
                winner_name = COALESCE(EXCLUDED.winner_name, draw_matches.winner_name),
                updated_at = NOW()
            `, [
              matchKey,
              0, // No tournament key from ESPN
              tournamentName,
              tour,
              roundName,
              round,
              0, // No player keys from ESPN
              player1,
              0,
              player2,
              new Date().toISOString().split('T')[0],
              status,
              winnerName
            ])

            totalSynced++
          }
        }
      }
    } catch (error) {
      errors.push(`${tour} sync failed: ${error}`)
    }
  }

  // Log the sync run
  try {
    await pool.query(`
      INSERT INTO draw_sync_log (source, matches_synced, tournaments_synced, active_tournaments_expected, errors, success)
      VALUES ('espn-admin', $1, $2, $3, $4, $5)
    `, [
      totalSynced,
      null,
      null,
      errors.length > 0 ? errors : null,
      totalSynced > 0
    ])
  } catch (e) {
    console.log('[draw-sync] Could not log sync run:', e)
  }

  return {
    success: totalSynced > 0 || errors.length === 0,
    matches_synced: totalSynced,
    errors
  }
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

  // Check admin session
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session || !session.isAdmin) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Admin access required' })
    }
  }

  const pool = getPool()

  if (event.httpMethod === 'GET') {
    // Get draw sync status
    try {
      const status = await getDrawSyncStatus(pool)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, ...status })
      }
    } catch (error) {
      console.error('[draw-sync] Status error:', error)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to get status' })
      }
    }
  }

  if (event.httpMethod === 'POST') {
    // Trigger manual sync
    console.log(`[ADMIN] Draw sync triggered by ${session.email}`)

    try {
      const result = await triggerDrawSync(pool)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: result.success,
          message: result.success
            ? `Synced ${result.matches_synced} matches`
            : `Sync completed with errors`,
          matches_synced: result.matches_synced,
          errors: result.errors
        })
      }
    } catch (error) {
      console.error('[draw-sync] Sync error:', error)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Sync failed', details: String(error) })
      }
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  }
}
