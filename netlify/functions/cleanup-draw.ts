/**
 * Cleanup Draw - Remove corrupt/misplaced matches from draw_matches
 */

import type { Handler } from "@netlify/functions";
import { getPool } from "./db";

const handler: Handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  const pool = getPool();

  try {
    // Delete SF/F matches that have non-seeded players (likely corrupt data)
    // In a real SF/F, we'd have top players, not qualifiers
    const result = await pool.query(`
      DELETE FROM draw_matches
      WHERE tournament_name ILIKE '%miami%'
        AND round_normalized IN ('SF', 'F', 'QF')
        AND (
          player_1_name IN ('A. Walton', 'C. Rodesch', 'M. Cassone', 'F. Maestrelli', 'R. Hijikata')
          OR player_2_name IN ('A. Walton', 'C. Rodesch', 'M. Cassone', 'F. Maestrelli', 'R. Hijikata')
        )
      RETURNING match_key
    `);

    // Also delete any R16/QF/SF/F that don't have real matchups yet
    const result2 = await pool.query(`
      DELETE FROM draw_matches
      WHERE tournament_name ILIKE '%miami%'
        AND round_normalized IN ('R16', 'QF', 'SF', 'F')
        AND status = 'upcoming'
        AND winner_name IS NULL
        AND (
          player_1_name NOT IN (
            SELECT DISTINCT winner_name FROM draw_matches
            WHERE tournament_name ILIKE '%miami%' AND winner_name IS NOT NULL
          )
          OR player_2_name NOT IN (
            SELECT DISTINCT winner_name FROM draw_matches
            WHERE tournament_name ILIKE '%miami%' AND winner_name IS NOT NULL
          )
        )
      RETURNING match_key
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deleted_corrupt: result.rowCount,
        deleted_premature: result2.rowCount,
        deleted_keys: [...result.rows, ...result2.rows].map(r => r.match_key).slice(0, 10)
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    };
  }
};

export { handler };
