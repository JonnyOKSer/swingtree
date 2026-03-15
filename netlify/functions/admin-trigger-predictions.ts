import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Trigger Predictions
 *
 * Emergency button to manually trigger the prediction pipeline when cron fails.
 * This function:
 * 1. Populates todays_matches from ESPN API
 * 2. Calls the tennis-oracle HTTP trigger to generate predictions
 *
 * Endpoint: POST /api/admin-trigger-predictions
 *
 * Response:
 * - 200: { success: true, status: {...}, matches: {...} }
 * - 403: { error: "Admin access required" }
 * - 500: { error: "..." }
 */

const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

// Tennis Oracle HTTP trigger endpoint (Railway)
const ORACLE_TRIGGER_URL = process.env.ORACLE_TRIGGER_URL || 'https://agent-production-765b.up.railway.app'
const ORACLE_API_KEY = process.env.ORACLE_API_KEY || 'ashe-trigger-secret'

interface ESPNCompetitor {
  athlete?: {
    displayName?: string
  }
}

interface ESPNCompetition {
  status?: {
    type?: {
      description?: string
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

async function fetchESPNMatches(tour: 'ATP' | 'WTA'): Promise<Array<{
  tournament: string
  round: string
  playerA: string
  playerB: string
  surface: string
  tour: string
}>> {
  const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`ESPN API returned ${response.status}`)

    const data: ESPNResponse = await response.json()
    const matches: Array<{
      tournament: string
      round: string
      playerA: string
      playerB: string
      surface: string
      tour: string
    }> = []

    for (const event of data.events || []) {
      const tournamentName = event.name || 'Unknown'

      // Infer surface
      let surface = 'Hard'
      const nameLower = tournamentName.toLowerCase()
      if (nameLower.includes('roland garros') || nameLower.includes('french') ||
          nameLower.includes('monte carlo') || nameLower.includes('rome') ||
          nameLower.includes('madrid') || nameLower.includes('barcelona')) {
        surface = 'Clay'
      } else if (nameLower.includes('wimbledon') || nameLower.includes('queen') ||
                 nameLower.includes('halle')) {
        surface = 'Grass'
      }

      // Find singles grouping
      const singlesSlug = tour === 'ATP' ? 'mens-singles' : 'womens-singles'

      for (const grouping of event.groupings || []) {
        if (grouping.grouping?.slug !== singlesSlug) continue

        for (const comp of grouping.competitions || []) {
          const status = comp.status?.type?.description?.toLowerCase() || ''
          if (status !== 'scheduled' && status !== 'in progress') continue

          const roundName = comp.round?.displayName || 'Unknown'
          const competitors = comp.competitors || []
          if (competitors.length < 2) continue

          const playerA = competitors[0]?.athlete?.displayName || 'TBD'
          const playerB = competitors[1]?.athlete?.displayName || 'TBD'

          if (playerA === 'TBD' || playerB === 'TBD') continue

          matches.push({
            tournament: tournamentName,
            round: normalizeRound(roundName),
            playerA,
            playerB,
            surface,
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

async function lookupPlayerId(pool: ReturnType<typeof getPool>, playerName: string, tour: 'ATP' | 'WTA'): Promise<number> {
  const table = tour === 'WTA' ? 'wta_matches' : 'matches'
  const lastName = playerName.split(' ').pop() || playerName

  // Try exact match
  let result = await pool.query(`
    SELECT winner_id FROM ${table}
    WHERE LOWER(winner_name) = LOWER($1)
    LIMIT 1
  `, [playerName])

  if (result.rows.length > 0) return result.rows[0].winner_id

  // Try last name match
  result = await pool.query(`
    SELECT winner_id FROM ${table}
    WHERE LOWER(winner_name) LIKE LOWER($1)
    ORDER BY LENGTH(winner_name)
    LIMIT 1
  `, [`%${lastName}%`])

  return result.rows[0]?.winner_id || -1
}

async function populateMatchesFromESPN(pool: ReturnType<typeof getPool>): Promise<{ atp: number, wta: number }> {
  const today = new Date().toISOString().split('T')[0]

  // Clear existing matches for today
  await pool.query('DELETE FROM todays_matches WHERE match_date = $1', [today])

  const counts = { atp: 0, wta: 0 }

  for (const tour of ['ATP', 'WTA'] as const) {
    const matches = await fetchESPNMatches(tour)

    for (const match of matches) {
      const playerAId = await lookupPlayerId(pool, match.playerA, tour)
      const playerBId = await lookupPlayerId(pool, match.playerB, tour)

      // Skip if we can't find either player (likely wrong tour)
      if (playerAId === -1 && playerBId === -1) continue

      await pool.query(`
        INSERT INTO todays_matches
        (match_date, tournament, surface, tourney_level, round,
         player_a_id, player_a_name, player_b_id, player_b_name, tour)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        today,
        match.tournament,
        match.surface,
        tour === 'ATP' ? 'M' : 'P',
        match.round,
        playerAId,
        match.playerA,
        playerBId,
        match.playerB,
        tour
      ])

      if (tour === 'ATP') counts.atp++
      else counts.wta++
    }
  }

  return counts
}

async function triggerOraclePredictions(): Promise<{ success: boolean, data?: unknown, error?: string }> {
  try {
    const response = await fetch(`${ORACLE_TRIGGER_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ORACLE_API_KEY
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Oracle trigger failed: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    return { success: false, error: `Oracle connection failed: ${error}` }
  }
}

async function getOracleStatus(): Promise<unknown> {
  try {
    const response = await fetch(`${ORACLE_TRIGGER_URL}/status`)
    if (response.ok) {
      return await response.json()
    }
    return { error: 'Status check failed' }
  } catch {
    return { error: 'Could not connect to Oracle service' }
  }
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Check admin session
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session || !session.isAdmin) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Admin access required' })
    }
  }

  console.log(`[ADMIN] Prediction trigger initiated by ${session.email}`)

  try {
    const pool = getPool()

    // Step 1: Populate matches from ESPN
    console.log('[ADMIN] Step 1: Populating matches from ESPN...')
    const matchCounts = await populateMatchesFromESPN(pool)
    console.log(`[ADMIN] Populated ${matchCounts.atp} ATP + ${matchCounts.wta} WTA matches`)

    // Step 2: Trigger Oracle predictions
    console.log('[ADMIN] Step 2: Triggering Oracle predictions...')
    const oracleResult = await triggerOraclePredictions()

    if (!oracleResult.success) {
      console.error('[ADMIN] Oracle trigger failed:', oracleResult.error)
      // Return partial success - matches were populated
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Matches populated but prediction trigger failed',
          matches: matchCounts,
          oracleError: oracleResult.error,
          note: 'Predictions will generate at next cron run (11am/5pm EST)'
        })
      }
    }

    // Step 3: Get final status
    const status = await getOracleStatus()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Predictions triggered successfully',
        matches: matchCounts,
        oracle: oracleResult.data,
        status
      })
    }
  } catch (error) {
    console.error('[ADMIN] Trigger error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: String(error) })
    }
  }
}
