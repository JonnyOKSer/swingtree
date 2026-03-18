import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

/**
 * Ticker API - Returns today's match results for the ticker component
 *
 * GET /api/ticker
 * Optional query param: ?tournamentKey=123 to filter by tournament
 *
 * Returns matches from today that are either:
 * - Completed (have a winner)
 * - In progress (live)
 */

interface TickerMatch {
  matchKey: string
  tour: 'ATP' | 'WTA'
  round: string
  tournamentKey: string
  tournamentName: string
  tournamentShortName: string
  player1Name: string
  player2Name: string
  winnerName: string | null
  score: string
  isLive: boolean
  indicator: '✅' | '❌' | '🌳' | '⚡' | ''
  scheduledAt: string
}

function shortenTournamentName(name: string): string {
  // Remove common suffixes
  return name
    .replace(/\s*Open$/i, '')
    .replace(/\s*Masters$/i, '')
    .replace(/\s*Championships?$/i, '')
    .replace(/\s*Classic$/i, '')
    .replace(/\s*International$/i, '')
    .replace(/\s*Grand Prix$/i, '')
    .trim()
    .substring(0, 20)
}

function determineIndicator(
  prediction: { correct?: boolean; first_set_score_correct?: boolean; divergence?: boolean } | null
): '✅' | '❌' | '🌳' | '⚡' | '' {
  if (!prediction) return ''

  // First set score correct gets tree (highest priority)
  if (prediction.first_set_score_correct) return '🌳'

  // Divergence - predicted first set winner differs from match winner
  if (prediction.divergence) return '⚡'

  // Match prediction result
  if (prediction.correct === true) return '✅'
  if (prediction.correct === false) return '❌'

  return ''
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const pool = getPool()
    const queryParams = event.queryStringParameters || {}
    const tournamentKeyFilter = queryParams.tournamentKey

    // Query for today's matches from draw_matches joined with predictions
    // Include both completed and live matches
    const result = await pool.query(`
      SELECT
        dm.match_key,
        dm.tour,
        dm.round_normalized as round,
        dm.tournament_key::text as tournament_key,
        dm.tournament_name,
        dm.player_1_name,
        dm.player_2_name,
        dm.winner_name,
        dm.final_result as score,
        dm.status,
        dm.scheduled_date,
        dm.scheduled_time,
        pl.correct,
        pl.first_set_score_correct,
        pl.first_set_winner,
        pl.predicted_winner
      FROM draw_matches dm
      LEFT JOIN prediction_log pl ON (
        LOWER(dm.tournament_name) = LOWER(pl.tournament)
        AND dm.round_normalized = pl.round
        AND dm.tour = pl.tour
        AND (
          (LOWER(dm.player_1_name) LIKE '%' || LOWER(SPLIT_PART(pl.player_a, ' ', -1)) || '%'
           AND LOWER(dm.player_2_name) LIKE '%' || LOWER(SPLIT_PART(pl.player_b, ' ', -1)) || '%')
          OR
          (LOWER(dm.player_1_name) LIKE '%' || LOWER(SPLIT_PART(pl.player_b, ' ', -1)) || '%'
           AND LOWER(dm.player_2_name) LIKE '%' || LOWER(SPLIT_PART(pl.player_a, ' ', -1)) || '%')
        )
      )
      WHERE dm.scheduled_date = CURRENT_DATE
        AND dm.status IN ('finished', 'live')
        ${tournamentKeyFilter ? 'AND dm.tournament_key::text = $1' : ''}
      ORDER BY
        CASE dm.status WHEN 'live' THEN 0 ELSE 1 END,
        dm.scheduled_time DESC NULLS LAST,
        dm.round_normalized
    `, tournamentKeyFilter ? [tournamentKeyFilter] : [])

    const matches: TickerMatch[] = result.rows.map(row => ({
      matchKey: row.match_key,
      tour: row.tour as 'ATP' | 'WTA',
      round: row.round || 'R32',
      tournamentKey: row.tournament_key,
      tournamentName: row.tournament_name,
      tournamentShortName: shortenTournamentName(row.tournament_name),
      player1Name: row.player_1_name,
      player2Name: row.player_2_name,
      winnerName: row.winner_name || null,
      score: row.score || '',
      isLive: row.status === 'live',
      indicator: row.winner_name ? determineIndicator({
        correct: row.correct,
        first_set_score_correct: row.first_set_score_correct,
        divergence: Boolean(row.first_set_winner && row.predicted_winner && row.first_set_winner !== row.predicted_winner)
      }) : '',
      scheduledAt: row.scheduled_date ?
        `${row.scheduled_date}T${row.scheduled_time || '00:00'}:00Z` :
        new Date().toISOString()
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        matches,
        count: matches.length
      })
    }
  } catch (error) {
    console.error('[ticker] Error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        matches: []
      })
    }
  }
}

export { handler }
