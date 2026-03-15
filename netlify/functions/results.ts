import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

interface TourResults {
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface ResultsData {
  atp: TourResults
  wta: TourResults
  combined: TourResults
  byTier: Record<string, { wins: number; total: number; percentage: number }>
  lastUpdated: string
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
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

    // Get overall results by tour
    // Filter by actual_winner (not correct) to include all reconciled matches
    // This ensures matches show up even if 'correct' field wasn't explicitly set
    const overallResult = await pool.query(`
      SELECT
        COALESCE(tour, 'ATP') as tour,
        COUNT(*) as total,
        SUM(CASE WHEN correct = true OR (correct IS NULL AND actual_winner = predicted_winner) THEN 1 ELSE 0 END) as match_wins,
        SUM(CASE WHEN first_set_correct = true THEN 1 ELSE 0 END) as first_set_wins
      FROM prediction_log
      WHERE actual_winner IS NOT NULL
        AND actual_winner NOT LIKE 'VOID%'
        AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY COALESCE(tour, 'ATP')
    `)

    // Get results by tier
    // Filter by actual_winner to include all reconciled matches
    const tierResult = await pool.query(`
      SELECT
        confidence_tier,
        COUNT(*) as total,
        SUM(CASE WHEN correct = true OR (correct IS NULL AND actual_winner = predicted_winner) THEN 1 ELSE 0 END) as wins
      FROM prediction_log
      WHERE actual_winner IS NOT NULL
        AND actual_winner NOT LIKE 'VOID%'
        AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY confidence_tier
      ORDER BY
        CASE confidence_tier
          WHEN 'STRONG' THEN 1
          WHEN 'CONFIDENT' THEN 2
          WHEN 'PICK' THEN 3
          WHEN 'LEAN' THEN 4
          ELSE 5
        END
    `)

    // Initialize results
    const atp: TourResults = {
      match: { wins: 0, total: 0, percentage: 0 },
      firstSet: { wins: 0, total: 0, percentage: 0 }
    }
    const wta: TourResults = {
      match: { wins: 0, total: 0, percentage: 0 },
      firstSet: { wins: 0, total: 0, percentage: 0 }
    }

    // Process tour results
    for (const row of overallResult.rows) {
      const tour = row.tour === 'WTA' ? wta : atp
      tour.match.total = parseInt(row.total)
      tour.match.wins = parseInt(row.match_wins)
      tour.match.percentage = tour.match.total > 0
        ? Math.round((tour.match.wins / tour.match.total) * 1000) / 10
        : 0
      tour.firstSet.total = parseInt(row.total)
      tour.firstSet.wins = parseInt(row.first_set_wins) || 0
      tour.firstSet.percentage = tour.firstSet.total > 0
        ? Math.round((tour.firstSet.wins / tour.firstSet.total) * 1000) / 10
        : 0
    }

    // Combined results
    const combined: TourResults = {
      match: {
        total: atp.match.total + wta.match.total,
        wins: atp.match.wins + wta.match.wins,
        percentage: 0
      },
      firstSet: {
        total: atp.firstSet.total + wta.firstSet.total,
        wins: atp.firstSet.wins + wta.firstSet.wins,
        percentage: 0
      }
    }
    combined.match.percentage = combined.match.total > 0
      ? Math.round((combined.match.wins / combined.match.total) * 1000) / 10
      : 0
    combined.firstSet.percentage = combined.firstSet.total > 0
      ? Math.round((combined.firstSet.wins / combined.firstSet.total) * 1000) / 10
      : 0

    // Process tier results
    const byTier: Record<string, { wins: number; total: number; percentage: number }> = {}
    for (const row of tierResult.rows) {
      const total = parseInt(row.total)
      const wins = parseInt(row.wins)
      byTier[row.confidence_tier] = {
        total,
        wins,
        percentage: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
      }
    }

    const results: ResultsData = {
      atp,
      wta,
      combined,
      byTier,
      lastUpdated: new Date().toISOString()
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        results
      })
    }
  } catch (error) {
    console.error('Error fetching results:', error)
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
