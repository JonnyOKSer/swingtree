import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

interface TourResults {
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface TournamentResults {
  tournament: string
  tour: string
  year: number
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface ResultsData {
  atp: TourResults
  wta: TourResults
  combined: TourResults
  byTier: Record<string, { wins: number; total: number; percentage: number }>
  byTournament: TournamentResults[]
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
    // For match wins: exclude SKIP tier, only count PICK and above (STRONG, CONFIDENT, PICK, LEAN)
    // For first set: include all tiers
    // Deduplicate by tournament+round+players to prevent same match from counting twice
    // Keep the prediction with highest confidence tier (lowest ordinal)
    const overallResult = await pool.query(`
      WITH ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(tournament), round, LEAST(LOWER(player_a), LOWER(player_b)), GREATEST(LOWER(player_a), LOWER(player_b)), tour
            ORDER BY
              CASE confidence_tier
                WHEN 'STRONG' THEN 1
                WHEN 'CONFIDENT' THEN 2
                WHEN 'PICK' THEN 3
                WHEN 'LEAN' THEN 4
                ELSE 5
              END,
              prediction_date DESC
          ) as rn
        FROM prediction_log
        WHERE actual_winner IS NOT NULL
          AND actual_winner NOT LIKE 'VOID%'
          AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
      ),
      deduplicated AS (
        SELECT * FROM ranked WHERE rn = 1
      )
      SELECT
        COALESCE(tour, 'ATP') as tour,
        COUNT(*) FILTER (WHERE confidence_tier NOT IN ('SKIP', 'VOID')) as total,
        SUM(CASE WHEN (correct = true OR (correct IS NULL AND actual_winner = predicted_winner))
                  AND confidence_tier NOT IN ('SKIP', 'VOID') THEN 1 ELSE 0 END) as match_wins,
        -- First set stats (qualifying already excluded in CTE)
        COUNT(*) as first_set_total,
        SUM(CASE WHEN first_set_score_correct = true THEN 1 ELSE 0 END) as first_set_wins
      FROM deduplicated
      GROUP BY COALESCE(tour, 'ATP')
    `)

    // Get results by tier (with deduplication by tournament+round+players)
    // Exclude qualifying rounds - only main draw matches
    const tierResult = await pool.query(`
      WITH ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(tournament), round, LEAST(LOWER(player_a), LOWER(player_b)), GREATEST(LOWER(player_a), LOWER(player_b)), tour
            ORDER BY
              CASE confidence_tier
                WHEN 'STRONG' THEN 1
                WHEN 'CONFIDENT' THEN 2
                WHEN 'PICK' THEN 3
                WHEN 'LEAN' THEN 4
                ELSE 5
              END,
              prediction_date DESC
          ) as rn
        FROM prediction_log
        WHERE actual_winner IS NOT NULL
          AND actual_winner NOT LIKE 'VOID%'
          AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
      ),
      deduplicated AS (
        SELECT * FROM ranked WHERE rn = 1
      )
      SELECT
        confidence_tier,
        COUNT(*) as total,
        SUM(CASE WHEN correct = true OR (correct IS NULL AND actual_winner = predicted_winner) THEN 1 ELSE 0 END) as wins
      FROM deduplicated
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

    // Get results by tournament (with deduplication)
    // Exclude qualifying rounds - only main draw matches
    const tournamentResult = await pool.query(`
      WITH ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(tournament), round, LEAST(LOWER(player_a), LOWER(player_b)), GREATEST(LOWER(player_a), LOWER(player_b)), tour
            ORDER BY
              CASE confidence_tier
                WHEN 'STRONG' THEN 1
                WHEN 'CONFIDENT' THEN 2
                WHEN 'PICK' THEN 3
                WHEN 'LEAN' THEN 4
                ELSE 5
              END,
              prediction_date DESC
          ) as rn
        FROM prediction_log
        WHERE actual_winner IS NOT NULL
          AND actual_winner NOT LIKE 'VOID%'
          AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
      ),
      deduplicated AS (
        SELECT * FROM ranked WHERE rn = 1
      )
      SELECT
        tournament,
        COALESCE(tour, 'ATP') as tour,
        EXTRACT(YEAR FROM MIN(prediction_date))::int as year,
        COUNT(*) FILTER (WHERE confidence_tier NOT IN ('SKIP', 'VOID')) as match_total,
        SUM(CASE WHEN (correct = true OR (correct IS NULL AND actual_winner = predicted_winner))
                  AND confidence_tier NOT IN ('SKIP', 'VOID') THEN 1 ELSE 0 END) as match_wins,
        -- First set stats (qualifying already excluded in CTE)
        COUNT(*) as first_set_total,
        SUM(CASE WHEN first_set_score_correct = true THEN 1 ELSE 0 END) as first_set_wins
      FROM deduplicated
      GROUP BY tournament, COALESCE(tour, 'ATP')
      ORDER BY COUNT(*) DESC
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
      // Match results: only PICK and above (excludes SKIP)
      tour.match.total = parseInt(row.total) || 0
      tour.match.wins = parseInt(row.match_wins) || 0
      tour.match.percentage = tour.match.total > 0
        ? Math.round((tour.match.wins / tour.match.total) * 1000) / 10
        : 0
      // First set results: all tiers
      tour.firstSet.total = parseInt(row.first_set_total) || 0
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

    // Process tournament results
    const byTournament: TournamentResults[] = tournamentResult.rows.map(row => {
      const matchTotal = parseInt(row.match_total) || 0
      const matchWins = parseInt(row.match_wins) || 0
      const fsTotal = parseInt(row.first_set_total) || 0
      const fsWins = parseInt(row.first_set_wins) || 0
      return {
        tournament: row.tournament,
        tour: row.tour,
        year: parseInt(row.year) || new Date().getFullYear(),
        match: {
          total: matchTotal,
          wins: matchWins,
          percentage: matchTotal > 0 ? Math.round((matchWins / matchTotal) * 1000) / 10 : 0
        },
        firstSet: {
          total: fsTotal,
          wins: fsWins,
          percentage: fsTotal > 0 ? Math.round((fsWins / fsTotal) * 1000) / 10 : 0
        }
      }
    })

    const results: ResultsData = {
      atp,
      wta,
      combined,
      byTier,
      byTournament,
      lastUpdated: new Date().toISOString()
    }

    // Debug mode: show raw and deduplicated predictions if ?debug=true
    const queryParams = event.queryStringParameters || {}
    if (queryParams.debug === 'true') {
      const rawResult = await pool.query(`
        SELECT id, prediction_date, tour, tournament, round, player_a, player_b,
               predicted_winner, actual_winner, confidence_tier, correct
        FROM prediction_log
        WHERE actual_winner IS NOT NULL
          AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
        ORDER BY prediction_date DESC, id DESC
        LIMIT 50
      `)
      const dedupedResult = await pool.query(`
        WITH ranked AS (
          SELECT id, prediction_date, tour, tournament, round, player_a, player_b,
                 predicted_winner, actual_winner, confidence_tier, correct,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(tournament), round, LEAST(LOWER(player_a), LOWER(player_b)), GREATEST(LOWER(player_a), LOWER(player_b)), tour
              ORDER BY
                CASE confidence_tier
                  WHEN 'STRONG' THEN 1
                  WHEN 'CONFIDENT' THEN 2
                  WHEN 'PICK' THEN 3
                  WHEN 'LEAN' THEN 4
                  ELSE 5
                END,
                prediction_date DESC
            ) as rn
          FROM prediction_log
          WHERE actual_winner IS NOT NULL
            AND actual_winner NOT LIKE 'VOID%'
            AND EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
        )
        SELECT id, prediction_date, tour, tournament, round, player_a, player_b,
               predicted_winner, actual_winner, confidence_tier, correct
        FROM ranked WHERE rn = 1
        ORDER BY prediction_date DESC, id DESC
      `)
      // Tournament debug: show distinct tournaments and their null status (main draw only)
      const tournamentDebug = await pool.query(`
        SELECT
          tournament,
          COUNT(*) as total_predictions,
          COUNT(*) FILTER (WHERE actual_winner IS NOT NULL) as reconciled,
          COUNT(*) FILTER (WHERE confidence_tier NOT IN ('SKIP', 'VOID')) as non_skip
        FROM prediction_log
        WHERE EXTRACT(YEAR FROM prediction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND (round IS NULL OR (round != 'Q' AND round !~ '^Q[0-9]*$'))
        GROUP BY tournament
        ORDER BY total_predictions DESC
      `)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          results,
          debug: {
            raw: rawResult.rows,
            deduplicated: dedupedResult.rows,
            rawCount: rawResult.rows.length,
            dedupedCount: dedupedResult.rows.length,
            tournaments: tournamentDebug.rows,
            tournamentResultRows: tournamentResult.rows.length,
            byTournamentLength: byTournament.length
          }
        })
      }
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
