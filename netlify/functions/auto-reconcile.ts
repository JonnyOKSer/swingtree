import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

// Auto-Reconcile Scheduled Function
//
// Runs every 10 minutes to reconcile predictions with actual results.
// This provides more frequent reconciliation than the Railway cron (which runs 3x daily).
//
// Schedule: Every 10 minutes (configured in netlify.toml)

interface ReconciliationResult {
  reconciled: number
  correct: number
  incorrect: number
  source: string
}

// ESPN completed matches API
const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

// Chinese surnames for proper name parsing (surname appears first in Chinese names)
const CHINESE_SURNAMES = new Set([
  'zheng', 'wang', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'wu', 'zhou',
  'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'lin', 'he', 'gao', 'luo', 'peng', 'yuan',
  'lu', 'han', 'shi', 'bai', 'xie', 'zeng', 'shen', 'qiu', 'wen', 'li'
])

// Extract last name for fuzzy matching (handles "D. Shnaider", "Zheng Qinwen", etc.)
function getLastName(name: string): string {
  if (!name) return ''
  const clean = name.toLowerCase().trim().replace(/\./g, '').replace(/-/g, ' ')
  const parts = clean.split(' ').filter(p => p.length > 0)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]

  // Check for Chinese surnames
  if (CHINESE_SURNAMES.has(parts[0])) return parts[0]
  if (CHINESE_SURNAMES.has(parts[parts.length - 1])) return parts[parts.length - 1]

  // Handle "Ugo Carabelli C." -> "carabelli"
  if (parts.length >= 3 && parts[parts.length - 1].length <= 2) {
    return parts[parts.length - 2]
  }

  // If last part is initial, use first substantial part
  if (parts[parts.length - 1].length <= 2) return parts[0]

  // If first part is initial, use last part
  if (parts[0].length <= 2) return parts[parts.length - 1]

  return parts[parts.length - 1]
}

async function fetchESPNCompletedMatches(tour: 'ATP' | 'WTA'): Promise<Map<string, { winner: string; loser: string; score: string }>> {
  const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL
  const results = new Map<string, { winner: string; loser: string; score: string }>()

  try {
    const response = await fetch(url)
    if (!response.ok) return results

    const data = await response.json()

    for (const event of data.events || []) {
      for (const grouping of event.groupings || []) {
        for (const comp of grouping.competitions || []) {
          const status = comp.status?.type?.description?.toLowerCase() || ''
          if (status !== 'final') continue

          const competitors = comp.competitors || []
          if (competitors.length < 2) continue

          const winner = competitors.find((c: any) => c.winner)
          const loser = competitors.find((c: any) => !c.winner)

          if (winner && loser) {
            const winnerName = winner.athlete?.displayName || ''
            const loserName = loser.athlete?.displayName || ''
            const score = comp.status?.displayName || ''

            // Create normalized key for lookup (exact match)
            const key = [winnerName.toLowerCase(), loserName.toLowerCase()].sort().join('|')
            results.set(key, { winner: winnerName, loser: loserName, score })

            // Also add last-name key for fuzzy matching
            const lastNameKey = [getLastName(winnerName), getLastName(loserName)].sort().join('|')
            if (lastNameKey !== key && !results.has(lastNameKey)) {
              results.set(lastNameKey, { winner: winnerName, loser: loserName, score })
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching ESPN ${tour}:`, error)
  }

  return results
}

// Fallback: Fetch completed matches from database (Jeff Sackmann data)
// This catches matches that have fallen off ESPN's live scoreboard
async function fetchDatabaseCompletedMatches(pool: any, cutoffDate: Date): Promise<Map<string, { winner: string; loser: string; score: string }>> {
  const results = new Map<string, { winner: string; loser: string; score: string }>()

  try {
    // Query ATP matches
    const atpResult = await pool.query(`
      SELECT winner_name, loser_name, score, tourney_date
      FROM matches
      WHERE tourney_date >= $1
        AND winner_name IS NOT NULL
        AND loser_name IS NOT NULL
      ORDER BY tourney_date DESC
    `, [cutoffDate.toISOString().split('T')[0]])

    for (const row of atpResult.rows) {
      const key = [row.winner_name.toLowerCase(), row.loser_name.toLowerCase()].sort().join('|')
      if (!results.has(key)) {
        results.set(key, { winner: row.winner_name, loser: row.loser_name, score: row.score || '' })
      }
      // Also add last-name key
      const lastNameKey = [getLastName(row.winner_name), getLastName(row.loser_name)].sort().join('|')
      if (!results.has(lastNameKey)) {
        results.set(lastNameKey, { winner: row.winner_name, loser: row.loser_name, score: row.score || '' })
      }
    }

    // Query WTA matches
    const wtaResult = await pool.query(`
      SELECT winner_name, loser_name, score, tourney_date
      FROM wta_matches
      WHERE tourney_date >= $1
        AND winner_name IS NOT NULL
        AND loser_name IS NOT NULL
      ORDER BY tourney_date DESC
    `, [cutoffDate.toISOString().split('T')[0]])

    for (const row of wtaResult.rows) {
      const key = [row.winner_name.toLowerCase(), row.loser_name.toLowerCase()].sort().join('|')
      if (!results.has(key)) {
        results.set(key, { winner: row.winner_name, loser: row.loser_name, score: row.score || '' })
      }
      const lastNameKey = [getLastName(row.winner_name), getLastName(row.loser_name)].sort().join('|')
      if (!results.has(lastNameKey)) {
        results.set(lastNameKey, { winner: row.winner_name, loser: row.loser_name, score: row.score || '' })
      }
    }

    console.log(`[auto-reconcile] Database: ${atpResult.rows.length} ATP + ${wtaResult.rows.length} WTA matches`)
  } catch (error) {
    console.error('[auto-reconcile] Database fallback error:', error)
  }

  return results
}

function extractFirstSetScore(score: string, winner: string, loser: string): { fsWinner: string | null; fsScore: string | null; fsTotalGames: number | null } {
  if (!score) return { fsWinner: null, fsScore: null, fsTotalGames: null }

  const firstSet = score.split(' ')[0] || ''
  if (!firstSet.includes('-')) return { fsWinner: null, fsScore: null, fsTotalGames: null }

  const clean = firstSet.replace(/[()]/g, '')
  const parts = clean.split('-')
  if (parts.length < 2) return { fsWinner: null, fsScore: null, fsTotalGames: null }

  try {
    const wGames = parseInt(parts[0][0])
    const lGames = parseInt(parts[1][0])
    const fsWinner = wGames > lGames ? winner : loser
    const fsScore = `${Math.max(wGames, lGames)}-${Math.min(wGames, lGames)}`
    const fsTotalGames = wGames + lGames
    return { fsWinner, fsScore, fsTotalGames }
  } catch {
    return { fsWinner: null, fsScore: null, fsTotalGames: null }
  }
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  }

  console.log('[auto-reconcile] Starting scheduled reconciliation...')

  try {
    const pool = getPool()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 7) // Look back 7 days (increased from 3)

    // Source 1: Fetch ESPN results for both tours (live scoreboard - recent matches)
    console.log('[auto-reconcile] Fetching ESPN results...')
    const atpResults = await fetchESPNCompletedMatches('ATP')
    const wtaResults = await fetchESPNCompletedMatches('WTA')
    const espnResults = new Map([...atpResults, ...wtaResults])
    console.log(`[auto-reconcile] ESPN: ${atpResults.size} ATP + ${wtaResults.size} WTA completed matches`)

    // Source 2: Fetch database results (Jeff Sackmann data - historical fallback)
    console.log('[auto-reconcile] Fetching database fallback...')
    const dbResults = await fetchDatabaseCompletedMatches(pool, cutoffDate)

    // Merge results: ESPN takes priority (more current), database fills gaps
    const allResults = new Map([...dbResults, ...espnResults])

    // Get unreconciled predictions
    const pendingResult = await pool.query(`
      SELECT id, player_a, player_b, predicted_winner, first_set_winner, first_set_score, prediction_date, first_set_over_9_5_prob
      FROM prediction_log
      WHERE prediction_date >= $1
        AND reconciled_at IS NULL
        AND actual_winner IS NULL
    `, [cutoffDate.toISOString().split('T')[0]])

    console.log(`[auto-reconcile] Found ${pendingResult.rows.length} unreconciled predictions`)

    let reconciled = 0
    let correct = 0
    let incorrect = 0

    for (const pred of pendingResult.rows) {
      // Try exact match first
      const exactKey = [pred.player_a.toLowerCase(), pred.player_b.toLowerCase()].sort().join('|')
      let result = allResults.get(exactKey)

      // Fallback to last-name matching (handles "D. Shnaider" vs "Diana Shnaider")
      if (!result) {
        const lastNameKey = [getLastName(pred.player_a), getLastName(pred.player_b)].sort().join('|')
        result = allResults.get(lastNameKey)
      }

      if (result) {
        // Use last-name matching for correctness check (handles name format variations)
        const predictedLast = getLastName(pred.predicted_winner)
        const actualWinnerLast = getLastName(result.winner)
        const isCorrect = predictedLast === actualWinnerLast
        const { fsWinner, fsScore, fsTotalGames } = extractFirstSetScore(result.score, result.winner, result.loser)
        // Use last-name matching for first set winner check
        const fsWinnerCorrect = fsWinner && pred.first_set_winner
          ? getLastName(pred.first_set_winner) === getLastName(fsWinner)
          : null
        const fsScoreCorrect = fsScore && pred.first_set_score ? pred.first_set_score === fsScore : null

        // Calculate O/U 9.5 correctness
        let fsOver95Correct: boolean | null = null
        if (fsTotalGames !== null && pred.first_set_over_9_5_prob !== null) {
          const actualOver = fsTotalGames > 9  // Over 9.5 means 10+ games
          const predictedOver = pred.first_set_over_9_5_prob > 0.5
          fsOver95Correct = actualOver === predictedOver
        }

        await pool.query(`
          UPDATE prediction_log
          SET actual_winner = $1,
              actual_first_set_winner = $2,
              actual_first_set_score = $3,
              correct = $4,
              first_set_correct = $5,
              first_set_score_correct = $6,
              first_set_over_9_5_correct = $7,
              reconciled_at = NOW()
          WHERE id = $8
        `, [result.winner, fsWinner, fsScore, isCorrect, fsWinnerCorrect, fsScoreCorrect, fsOver95Correct, pred.id])

        reconciled++
        if (isCorrect) correct++
        else incorrect++

        console.log(`[auto-reconcile] ${pred.player_a} vs ${pred.player_b} -> ${result.winner} ${isCorrect ? '✓' : '✗'}`)
      }
    }

    const stats: ReconciliationResult = {
      reconciled,
      correct,
      incorrect,
      source: 'ESPN+Database'
    }

    console.log(`[auto-reconcile] Complete: ${reconciled} reconciled (${correct} correct, ${incorrect} incorrect)`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Auto-reconciliation complete',
        stats,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('[auto-reconcile] Error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export { handler }
