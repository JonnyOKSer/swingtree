/**
 * ASHE Prediction Reconciliation
 *
 * Two jobs in one:
 *
 * 1. Orphan Resolution: Finds predictions without match_key and attempts
 *    to resolve them against draw_matches using tournament + round + players
 *
 * 2. Result Reconciliation: For finished matches, marks predictions as
 *    correct/incorrect based on actual winner
 *
 * Runs every 15 minutes via scheduled function.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import { buildMatchKey } from "./draw-utils";

// ============================================================================
// Types
// ============================================================================

interface ReconciliationResult {
  orphans_found: number;
  orphans_resolved: number;
  orphans_stale: number;  // > 24 hours old
  predictions_reconciled: number;
  errors: string[];
}

// ============================================================================
// Orphan Resolution
// ============================================================================

async function resolveOrphanedPredictions(pool: ReturnType<typeof getPool>): Promise<{
  found: number;
  resolved: number;
  stale: number;
}> {
  // Find orphaned predictions (match_key IS NULL)
  const orphans = await pool.query(`
    SELECT
      ap.id,
      ap.tournament_key,
      ap.round_normalized,
      ap.player_1_key,
      ap.player_2_key,
      ap.orphan_logged_at,
      ap.predicted_at
    FROM ashe_predictions ap
    WHERE ap.match_key IS NULL
  `);

  let resolved = 0;
  let stale = 0;
  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const orphan of orphans.rows) {
    // Check if stale (> 24 hours old)
    const predictedAt = new Date(orphan.predicted_at);
    if (predictedAt < staleThreshold) {
      stale++;

      // Log stale orphan if not already logged
      if (!orphan.orphan_logged_at) {
        await pool.query(`
          UPDATE ashe_predictions
          SET orphan_logged_at = NOW()
          WHERE id = $1
        `, [orphan.id]);

        console.warn(`[reconcile] Stale orphan detected: prediction ${orphan.id}, ` +
          `tournament ${orphan.tournament_key}, round ${orphan.round_normalized}`);
      }
    }

    // Try to find matching draw_match
    const matchKey = buildMatchKey(
      orphan.tournament_key,
      orphan.round_normalized,
      orphan.player_1_key,
      orphan.player_2_key
    );

    const matchResult = await pool.query(`
      SELECT match_key FROM draw_matches WHERE match_key = $1
    `, [matchKey]);

    if (matchResult.rows.length > 0) {
      // Resolve the orphan
      await pool.query(`
        UPDATE ashe_predictions
        SET match_key = $1,
            orphan_logged_at = NULL
        WHERE id = $2
      `, [matchKey, orphan.id]);

      resolved++;
      console.log(`[reconcile] Resolved orphan: prediction ${orphan.id} → match ${matchKey}`);
    }
  }

  return {
    found: orphans.rows.length,
    resolved,
    stale
  };
}

// ============================================================================
// Result Reconciliation
// ============================================================================

async function reconcilePredictionResults(pool: ReturnType<typeof getPool>): Promise<number> {
  // Find predictions for finished matches that haven't been reconciled
  const unreconciled = await pool.query(`
    SELECT
      ap.id,
      ap.match_key,
      ap.predicted_winner_key,
      ap.first_set_winner_key,
      ap.first_set_score AS predicted_first_set_score,
      dm.winner_key AS actual_winner_key,
      dm.final_result
    FROM ashe_predictions ap
    JOIN draw_matches dm ON ap.match_key = dm.match_key
    WHERE dm.status = 'finished'
      AND dm.winner_key IS NOT NULL
      AND ap.result IS NULL
  `);

  let reconciled = 0;

  for (const row of unreconciled.rows) {
    // Determine if prediction was correct
    const predictionCorrect = row.predicted_winner_key === row.actual_winner_key;

    // Parse first set from final_result if available
    let firstSetResult: string | null = null;
    let actualFirstSetWinner: number | null = null;

    if (row.final_result) {
      const firstSetMatch = parseFirstSet(row.final_result);
      if (firstSetMatch) {
        // Determine who won first set
        // final_result format: "6-4 6-3" means player 1 won 6-4, 6-3
        // We need to know which player is "first" in the result
        // For now, assume first number is player_1's score
        // TODO: Verify this assumption with api-tennis data
        actualFirstSetWinner = firstSetMatch.p1Score > firstSetMatch.p2Score
          ? row.player_1_key
          : row.player_2_key;
      }
    }

    // Determine first set prediction result
    let firstSetPredictionResult: string | null = null;
    if (row.first_set_winner_key && actualFirstSetWinner) {
      firstSetPredictionResult = row.first_set_winner_key === actualFirstSetWinner
        ? "correct"
        : "incorrect";
    }

    // Update prediction
    await pool.query(`
      UPDATE ashe_predictions
      SET result = $1,
          result_first_set = $2,
          reconciled_at = NOW()
      WHERE id = $3
    `, [
      predictionCorrect ? "correct" : "incorrect",
      firstSetPredictionResult,
      row.id
    ]);

    reconciled++;
    console.log(`[reconcile] Prediction ${row.id}: ${predictionCorrect ? '✅' : '❌'} ` +
      `(predicted ${row.predicted_winner_key}, actual ${row.actual_winner_key})`);
  }

  return reconciled;
}

/**
 * Parse first set score from final result string
 * e.g., "6-4 6-3" → { p1Score: 6, p2Score: 4 }
 */
function parseFirstSet(finalResult: string): { p1Score: number; p2Score: number } | null {
  const match = finalResult.match(/^(\d+)-(\d+)/);
  if (!match) return null;

  return {
    p1Score: parseInt(match[1]),
    p2Score: parseInt(match[2])
  };
}

// ============================================================================
// Handler
// ============================================================================

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  console.log(`[reconcile] Starting reconciliation at ${new Date().toISOString()}`);

  const result: ReconciliationResult = {
    orphans_found: 0,
    orphans_resolved: 0,
    orphans_stale: 0,
    predictions_reconciled: 0,
    errors: []
  };

  try {
    const pool = getPool();

    // Step 1: Resolve orphaned predictions
    const orphanResult = await resolveOrphanedPredictions(pool);
    result.orphans_found = orphanResult.found;
    result.orphans_resolved = orphanResult.resolved;
    result.orphans_stale = orphanResult.stale;

    // Step 2: Reconcile prediction results
    result.predictions_reconciled = await reconcilePredictionResults(pool);

    console.log(`[reconcile] Complete: ` +
      `${result.orphans_resolved}/${result.orphans_found} orphans resolved, ` +
      `${result.orphans_stale} stale, ` +
      `${result.predictions_reconciled} predictions reconciled`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result
      })
    };

  } catch (error) {
    console.error("[reconcile] Error:", error);
    result.errors.push(error instanceof Error ? error.message : String(error));

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        ...result
      })
    };
  }
};

export { handler };
