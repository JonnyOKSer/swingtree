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

// Source 1: Fetch from match_results (our permanent results database)
// This is the PRIMARY source - populated by capture-results from draw_matches
async function fetchMatchResults(pool: any, cutoffDate: Date): Promise<Map<string, { winner: string; loser: string; score: string }>> {
  const results = new Map<string, { winner: string; loser: string; score: string }>()

  try {
    const resultRows = await pool.query(`
      SELECT player_1_name, player_2_name, winner_name, loser_name, final_result, scheduled_date
      FROM match_results
      WHERE scheduled_date >= $1
      ORDER BY scheduled_date DESC
    `, [cutoffDate.toISOString().split('T')[0]])

    for (const row of resultRows.rows) {
      const key = [row.player_1_name.toLowerCase(), row.player_2_name.toLowerCase()].sort().join('|')
      if (!results.has(key)) {
        results.set(key, { winner: row.winner_name, loser: row.loser_name, score: row.final_result || '' })
      }
      const lastNameKey = [getLastName(row.player_1_name), getLastName(row.player_2_name)].sort().join('|')
      if (!results.has(lastNameKey)) {
        results.set(lastNameKey, { winner: row.winner_name, loser: row.loser_name, score: row.final_result || '' })
      }
    }

    console.log(`[auto-reconcile] match_results: ${resultRows.rows.length} permanent results`)
  } catch (error) {
    // Table might not exist yet - that's ok, capture-results will create it
    console.log('[auto-reconcile] match_results table not found, skipping')
  }

  return results
}

// Source 2: Fetch from draw_matches (ESPN-synced, 14-day window - fallback for very recent)
async function fetchDrawMatchesCompleted(pool: any, cutoffDate: Date): Promise<Map<string, { winner: string; loser: string; score: string }>> {
  const results = new Map<string, { winner: string; loser: string; score: string }>()

  try {
    const drawResult = await pool.query(`
      SELECT player_1_name, player_2_name, winner_name, final_result, status, scheduled_date
      FROM draw_matches
      WHERE scheduled_date >= $1
        AND status IN ('finished', 'completed')
        AND winner_name IS NOT NULL
      ORDER BY scheduled_date DESC
    `, [cutoffDate.toISOString().split('T')[0]])

    for (const row of drawResult.rows) {
      const winner = row.winner_name
      const loser = row.player_1_name === winner ? row.player_2_name : row.player_1_name
      const score = row.final_result || ''

      const key = [row.player_1_name.toLowerCase(), row.player_2_name.toLowerCase()].sort().join('|')
      if (!results.has(key)) {
        results.set(key, { winner, loser, score })
      }
      const lastNameKey = [getLastName(row.player_1_name), getLastName(row.player_2_name)].sort().join('|')
      if (!results.has(lastNameKey)) {
        results.set(lastNameKey, { winner, loser, score })
      }
    }

    console.log(`[auto-reconcile] draw_matches: ${drawResult.rows.length} completed matches`)
  } catch (error) {
    console.error('[auto-reconcile] draw_matches error:', error)
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

    // Source 1: match_results (our permanent database - PRIMARY)
    console.log('[auto-reconcile] Fetching match_results (permanent)...')
    const permanentResults = await fetchMatchResults(pool, cutoffDate)

    // Source 2: draw_matches (ESPN-synced, 14-day window - for very recent)
    console.log('[auto-reconcile] Fetching draw_matches (recent)...')
    const drawResults = await fetchDrawMatchesCompleted(pool, cutoffDate)

    // Source 3: ESPN live scoreboard (real-time, last 24-48h only)
    console.log('[auto-reconcile] Fetching ESPN live...')
    const atpResults = await fetchESPNCompletedMatches('ATP')
    const wtaResults = await fetchESPNCompletedMatches('WTA')
    const espnResults = new Map([...atpResults, ...wtaResults])
    console.log(`[auto-reconcile] ESPN live: ${atpResults.size} ATP + ${wtaResults.size} WTA`)

    // Merge results: permanent > draw_matches > ESPN live
    // Earlier sources have priority (permanent is most reliable)
    const allResults = new Map([...espnResults, ...drawResults, ...permanentResults])

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
      source: 'match_results+draw_matches+ESPN'
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
