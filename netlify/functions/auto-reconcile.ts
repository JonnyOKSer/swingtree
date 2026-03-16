import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

/**
 * Auto-Reconcile Scheduled Function
 *
 * Runs every 10 minutes to reconcile predictions with actual results.
 * This provides more frequent reconciliation than the Railway cron (which runs 3x daily).
 *
 * Schedule: Every 10 minutes
 * Configure in netlify.toml:
 *   [functions."auto-reconcile"]
 *   schedule = "*/10 * * * *"
 */

interface ReconciliationResult {
  reconciled: number
  correct: number
  incorrect: number
  source: string
}

// ESPN completed matches API
const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

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

            // Create normalized key for lookup
            const key = [winnerName.toLowerCase(), loserName.toLowerCase()].sort().join('|')
            results.set(key, { winner: winnerName, loser: loserName, score })
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching ESPN ${tour}:`, error)
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
    cutoffDate.setDate(cutoffDate.getDate() - 3) // Look back 3 days

    // Fetch ESPN results for both tours
    console.log('[auto-reconcile] Fetching ESPN results...')
    const atpResults = await fetchESPNCompletedMatches('ATP')
    const wtaResults = await fetchESPNCompletedMatches('WTA')
    const allResults = new Map([...atpResults, ...wtaResults])
    console.log(`[auto-reconcile] ESPN: ${atpResults.size} ATP + ${wtaResults.size} WTA completed matches`)

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
      const key = [pred.player_a.toLowerCase(), pred.player_b.toLowerCase()].sort().join('|')
      const result = allResults.get(key)

      if (result) {
        const isCorrect = pred.predicted_winner === result.winner
        const { fsWinner, fsScore, fsTotalGames } = extractFirstSetScore(result.score, result.winner, result.loser)
        const fsWinnerCorrect = fsWinner ? pred.first_set_winner === fsWinner : null
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
      source: 'ESPN'
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
