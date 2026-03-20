/**
 * Cleanup Draw - Remove corrupt/misplaced/duplicate matches from draw_matches
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
    // 1. Delete matches with UNKNOWN round
    const unknownResult = await pool.query(`
      DELETE FROM draw_matches
      WHERE round_normalized = 'UNKNOWN'
      RETURNING match_key
    `);

    // 2. Delete duplicate matches (keep the one with most data)
    // Find duplicates by player pair + round and delete the older ones
    const dupeResult = await pool.query(`
      DELETE FROM draw_matches
      WHERE match_key IN (
        SELECT match_key FROM (
          SELECT match_key,
                 ROW_NUMBER() OVER (
                   PARTITION BY tournament_key, round_normalized,
                                LEAST(player_1_key, player_2_key),
                                GREATEST(player_1_key, player_2_key)
                   ORDER BY
                     CASE WHEN winner_name IS NOT NULL THEN 0 ELSE 1 END,
                     draw_synced_at DESC
                 ) as rn
          FROM draw_matches
        ) ranked
        WHERE rn > 1
      )
      RETURNING match_key
    `);

    // 3. Delete corrupt late-round matches (challenger players in SF/F)
    const corruptResult = await pool.query(`
      DELETE FROM draw_matches
      WHERE tournament_name ILIKE '%miami%'
        AND round_normalized IN ('SF', 'F')
        AND player_1_name NOT IN (
          'C. Alcaraz', 'J. Sinner', 'A. Zverev', 'D. Medvedev', 'C. Ruud',
          'A. Rublev', 'H. Hurkacz', 'T. Fritz', 'S. Tsitsipas', 'G. Dimitrov',
          'A. Sabalenka', 'I. Swiatek', 'C. Gauff', 'J. Pegula', 'E. Rybakina',
          'O. Jabeur', 'M. Sakkari', 'K. Muchova', 'B. Haddad Maia', 'M. Vondrousova'
        )
      RETURNING match_key
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deleted_unknown: unknownResult.rowCount,
        deleted_duplicates: dupeResult.rowCount,
        deleted_corrupt: corruptResult.rowCount
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
