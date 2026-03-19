import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

/**
 * Wagering Strategies API - Admin only
 *
 * Analyzes historical predictions to find optimal betting patterns
 */

interface WageringInsight {
  id: string
  timestamp: string
  tournament: string | null
  type: 'parlay' | 'single' | 'round_pattern' | 'tier_pattern'
  predictionType: string
  description: string
  winRate: number
  sampleSize: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface RoundAccuracy {
  round: string
  matchWinner: number | null
  firstSetWinner: number | null
  firstSetScore: number | null
  total: number
}

interface WageringAnalysis {
  generatedAt: string
  totalPredictions: number
  dateRange: { start: string; end: string } | null
  insights: WageringInsight[]
  roundPatterns: RoundAccuracy[]
  tierPatterns: {
    tier: string
    matchWinRate: number
    fsWinnerRate: number
    fsScoreRate: number
    total: number
  }[]
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const pool = getPool()
    const queryParams = event.queryStringParameters || {}
    const daysBack = parseInt(queryParams.days || '30')

    // Get prediction data grouped by various dimensions
    const result = await pool.query(`
      WITH predictions AS (
        SELECT
          id,
          prediction_date,
          tournament,
          tour,
          round,
          confidence_tier,
          predicted_prob,
          correct as match_correct,
          first_set_correct as fs_winner_correct,
          first_set_score_correct as fs_score_correct,
          first_set_winner,
          predicted_winner
        FROM prediction_log
        WHERE reconciled_at IS NOT NULL
          AND actual_winner IS NOT NULL
          AND actual_winner NOT LIKE 'VOID%'
          AND confidence_tier != 'VOID'
          AND is_qualifying = FALSE
          AND prediction_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      )
      SELECT
        MIN(prediction_date) as start_date,
        MAX(prediction_date) as end_date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE match_correct = true) as match_wins,
        COUNT(*) FILTER (WHERE fs_winner_correct = true) as fs_winner_wins,
        COUNT(*) FILTER (WHERE fs_score_correct = true) as fs_score_wins
      FROM predictions
    `)

    const summary = result.rows[0]

    // Get accuracy by round
    const roundResult = await pool.query(`
      SELECT
        round,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE correct = true) as match_wins,
        COUNT(*) FILTER (WHERE first_set_correct = true) as fs_winner_wins,
        COUNT(*) FILTER (WHERE first_set_score_correct = true) as fs_score_wins
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND actual_winner IS NOT NULL
        AND actual_winner NOT LIKE 'VOID%'
        AND confidence_tier != 'VOID'
        AND is_qualifying = FALSE
        AND prediction_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY round
      ORDER BY
        CASE round
          WHEN 'R128' THEN 1
          WHEN 'R64' THEN 2
          WHEN 'R32' THEN 3
          WHEN 'R16' THEN 4
          WHEN 'QF' THEN 5
          WHEN 'SF' THEN 6
          WHEN 'F' THEN 7
          ELSE 8
        END
    `)

    // Get accuracy by tier
    const tierResult = await pool.query(`
      SELECT
        confidence_tier as tier,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE correct = true) as match_wins,
        COUNT(*) FILTER (WHERE first_set_correct = true) as fs_winner_wins,
        COUNT(*) FILTER (WHERE first_set_score_correct = true) as fs_score_wins
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND actual_winner IS NOT NULL
        AND actual_winner NOT LIKE 'VOID%'
        AND confidence_tier != 'VOID'
        AND is_qualifying = FALSE
        AND prediction_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY confidence_tier
      ORDER BY
        CASE confidence_tier
          WHEN 'STRONG' THEN 1
          WHEN 'CONFIDENT' THEN 2
          WHEN 'PICK' THEN 3
          WHEN 'LEAN' THEN 4
          WHEN 'SKIP' THEN 5
          ELSE 6
        END
    `)

    // Get tournament breakdown
    const tournamentResult = await pool.query(`
      SELECT
        tournament,
        tour,
        MIN(prediction_date) as start_date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE correct = true) as match_wins,
        COUNT(*) FILTER (WHERE first_set_score_correct = true) as fs_score_wins
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND actual_winner IS NOT NULL
        AND actual_winner NOT LIKE 'VOID%'
        AND confidence_tier != 'VOID'
        AND is_qualifying = FALSE
        AND prediction_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY tournament, tour
      ORDER BY MIN(prediction_date) DESC
    `)

    // Build insights
    const insights: WageringInsight[] = []
    let insightId = 1

    // Round-based insights
    const lateRounds = ['R16', 'QF', 'SF', 'F']
    const earlyRounds = ['R128', 'R64', 'R32']

    let lateTotal = 0, lateWins = 0, earlyTotal = 0, earlyWins = 0
    for (const row of roundResult.rows) {
      if (lateRounds.includes(row.round)) {
        lateTotal += parseInt(row.total)
        lateWins += parseInt(row.match_wins)
      } else if (earlyRounds.includes(row.round)) {
        earlyTotal += parseInt(row.total)
        earlyWins += parseInt(row.match_wins)
      }
    }

    if (lateTotal >= 5 && earlyTotal >= 5) {
      const lateRate = lateWins / lateTotal
      const earlyRate = earlyWins / earlyTotal
      if (lateRate > earlyRate + 0.05) {
        insights.push({
          id: `insight_${insightId++}`,
          timestamp: new Date().toISOString(),
          tournament: null,
          type: 'round_pattern',
          predictionType: 'match_winner',
          description: `Late rounds (R16+) show ${((lateRate - earlyRate) * 100).toFixed(1)}pp higher accuracy than early rounds`,
          winRate: lateRate,
          sampleSize: lateTotal,
          confidence: lateTotal >= 20 ? 'HIGH' : lateTotal >= 10 ? 'MEDIUM' : 'LOW'
        })
      }
    }

    // Tier-based insights
    for (const row of tierResult.rows) {
      const total = parseInt(row.total)
      if (total >= 5) {
        const matchRate = parseInt(row.match_wins) / total
        const fsScoreRate = parseInt(row.fs_score_wins) / total

        if (matchRate >= 0.65) {
          insights.push({
            id: `insight_${insightId++}`,
            timestamp: new Date().toISOString(),
            tournament: null,
            type: 'tier_pattern',
            predictionType: 'match_winner',
            description: `${row.tier} tier match predictions hitting at ${(matchRate * 100).toFixed(1)}%`,
            winRate: matchRate,
            sampleSize: total,
            confidence: total >= 20 ? 'HIGH' : total >= 10 ? 'MEDIUM' : 'LOW'
          })
        }

        if (fsScoreRate >= 0.15 && total >= 10) {
          insights.push({
            id: `insight_${insightId++}`,
            timestamp: new Date().toISOString(),
            tournament: null,
            type: 'tier_pattern',
            predictionType: 'first_set_score',
            description: `${row.tier} tier 1st set score predictions: ${(fsScoreRate * 100).toFixed(1)}% exact hits`,
            winRate: fsScoreRate,
            sampleSize: total,
            confidence: total >= 20 ? 'HIGH' : total >= 10 ? 'MEDIUM' : 'LOW'
          })
        }
      }
    }

    // Tournament-specific insights
    for (const row of tournamentResult.rows) {
      const total = parseInt(row.total)
      if (total >= 5) {
        const matchRate = parseInt(row.match_wins) / total
        if (matchRate >= 0.60) {
          insights.push({
            id: `insight_${insightId++}`,
            timestamp: row.start_date,
            tournament: row.tournament,
            type: 'single',
            predictionType: 'match_winner',
            description: `${row.tournament} (${row.tour}): ${(matchRate * 100).toFixed(1)}% match accuracy`,
            winRate: matchRate,
            sampleSize: total,
            confidence: total >= 15 ? 'HIGH' : total >= 8 ? 'MEDIUM' : 'LOW'
          })
        }
      }
    }

    // Sort insights by win rate
    insights.sort((a, b) => b.winRate - a.winRate)

    // Build round patterns
    const roundPatterns: RoundAccuracy[] = roundResult.rows.map(row => ({
      round: row.round,
      matchWinner: parseInt(row.total) > 0 ? parseInt(row.match_wins) / parseInt(row.total) : null,
      firstSetWinner: parseInt(row.total) > 0 ? parseInt(row.fs_winner_wins) / parseInt(row.total) : null,
      firstSetScore: parseInt(row.total) > 0 ? parseInt(row.fs_score_wins) / parseInt(row.total) : null,
      total: parseInt(row.total)
    }))

    // Build tier patterns
    const tierPatterns = tierResult.rows.map(row => ({
      tier: row.tier,
      matchWinRate: parseInt(row.total) > 0 ? parseInt(row.match_wins) / parseInt(row.total) : 0,
      fsWinnerRate: parseInt(row.total) > 0 ? parseInt(row.fs_winner_wins) / parseInt(row.total) : 0,
      fsScoreRate: parseInt(row.total) > 0 ? parseInt(row.fs_score_wins) / parseInt(row.total) : 0,
      total: parseInt(row.total)
    }))

    const analysis: WageringAnalysis = {
      generatedAt: new Date().toISOString(),
      totalPredictions: parseInt(summary.total) || 0,
      dateRange: summary.start_date && summary.end_date ? {
        start: summary.start_date,
        end: summary.end_date
      } : null,
      insights,
      roundPatterns,
      tierPatterns
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analysis
      })
    }
  } catch (error) {
    console.error('Error fetching wagering strategies:', error)
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
