import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

/**
 * Capture Results - Permanent Match Results Storage
 *
 * Copies completed matches from draw_matches to match_results table.
 * This ensures we have a permanent record of all match results for reconciliation,
 * even after tournaments end and fall off ESPN/draw_matches.
 *
 * Schedule: Every 15 minutes (captures results before they expire)
 *
 * Architecture:
 *   draw_matches (ESPN sync, 14-day window)
 *     → capture-results (this function)
 *     → match_results (permanent storage)
 *     → auto-reconcile (uses match_results for reconciliation)
 */

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  }

  console.log('[capture-results] Starting...')

  try {
    const pool = getPool()

    // Ensure match_results table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS match_results (
        id SERIAL PRIMARY KEY,
        match_key VARCHAR(100) UNIQUE,
        tournament_name VARCHAR(200),
        tour VARCHAR(10),
        round VARCHAR(20),
        scheduled_date DATE,
        player_1_name VARCHAR(100),
        player_2_name VARCHAR(100),
        winner_name VARCHAR(100),
        loser_name VARCHAR(100),
        final_result VARCHAR(100),
        captured_at TIMESTAMP DEFAULT NOW(),
        source VARCHAR(50) DEFAULT 'draw_matches'
      )
    `)

    // Add indexes for efficient lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_match_results_players
      ON match_results (LOWER(player_1_name), LOWER(player_2_name))
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_match_results_date
      ON match_results (scheduled_date)
    `)

    // Copy completed matches from draw_matches that aren't already in match_results
    const insertResult = await pool.query(`
      INSERT INTO match_results (
        match_key, tournament_name, tour, round, scheduled_date,
        player_1_name, player_2_name, winner_name, loser_name, final_result, source
      )
      SELECT
        dm.match_key,
        dm.tournament_name,
        dm.tour,
        dm.round_normalized,
        dm.scheduled_date,
        dm.player_1_name,
        dm.player_2_name,
        dm.winner_name,
        CASE
          WHEN dm.winner_name = dm.player_1_name THEN dm.player_2_name
          ELSE dm.player_1_name
        END as loser_name,
        dm.final_result,
        'draw_matches'
      FROM draw_matches dm
      WHERE dm.status IN ('finished', 'completed')
        AND dm.winner_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM match_results mr
          WHERE mr.match_key = dm.match_key
        )
      ON CONFLICT (match_key) DO NOTHING
      RETURNING id
    `)

    const capturedCount = insertResult.rowCount || 0

    // Get total count for reporting
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM match_results
    `)
    const totalCount = parseInt(totalResult.rows[0]?.total || '0')

    // Get count by month for sanity check
    const byMonthResult = await pool.query(`
      SELECT
        DATE_TRUNC('month', scheduled_date) as month,
        COUNT(*) as count
      FROM match_results
      GROUP BY DATE_TRUNC('month', scheduled_date)
      ORDER BY month DESC
      LIMIT 6
    `)

    const byMonth = byMonthResult.rows.map(r => ({
      month: r.month?.toISOString()?.split('T')[0] || 'unknown',
      count: parseInt(r.count)
    }))

    console.log(`[capture-results] Captured ${capturedCount} new results. Total: ${totalCount}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        captured: capturedCount,
        total: totalCount,
        byMonth,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('[capture-results] Error:', error)
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
