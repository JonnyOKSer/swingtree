/**
 * ASHE Prediction Storage
 *
 * Receives predictions from the ASHE model and stores them in ashe_predictions.
 * Handles the case where draw data may not yet exist (orphaned predictions).
 *
 * POST /api/store-prediction
 * {
 *   tournament_key: 1928,
 *   tournament_name: "Miami",
 *   tour: "ATP",
 *   round: "QF",
 *   player_1_key: 2072,
 *   player_1_name: "J. Sinner",
 *   player_2_key: 2382,
 *   player_2_name: "C. Alcaraz",
 *   predicted_winner_key: 2072,
 *   predicted_winner_name: "J. Sinner",
 *   confidence_pct: 62.5,
 *   first_set_winner_key?: 2072,
 *   first_set_winner_name?: "J. Sinner",
 *   first_set_score?: "6-4",
 *   market_implied_prob?: 45.0,
 *   market_edge?: 17.5
 * }
 *
 * Can also accept batch predictions:
 * POST /api/store-prediction { predictions: [...] }
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import { buildMatchKey, getConfidenceTier } from "./draw-utils";
import { parseSessionFromCookies } from "./auth-utils";

// ============================================================================
// Types
// ============================================================================

interface PredictionInput {
  tournament_key: number;
  tournament_name?: string;
  tour?: string;
  round: string;  // Already normalized (R128, R64, etc.)
  player_1_key: number;
  player_1_name?: string;
  player_2_key: number;
  player_2_name?: string;
  predicted_winner_key: number;
  predicted_winner_name: string;
  confidence_pct: number;
  first_set_winner_key?: number;
  first_set_winner_name?: string;
  first_set_score?: string;
  market_implied_prob?: number;
  market_edge?: number;
}

interface StorageResult {
  success: boolean;
  id?: number;
  match_key?: string;
  orphaned: boolean;
  error?: string;
}

// ============================================================================
// Storage Logic
// ============================================================================

async function storePrediction(
  pool: ReturnType<typeof getPool>,
  input: PredictionInput
): Promise<StorageResult> {
  // Build match key
  const matchKey = buildMatchKey(
    input.tournament_key,
    input.round,
    input.player_1_key,
    input.player_2_key
  );

  // Determine confidence tier
  const confidenceTier = getConfidenceTier(input.confidence_pct);

  // Check if draw_match exists
  const matchExists = await pool.query(`
    SELECT match_key FROM draw_matches WHERE match_key = $1
  `, [matchKey]);

  const isOrphaned = matchExists.rows.length === 0;

  if (isOrphaned) {
    console.log(`[store-prediction] Storing orphaned prediction: ${matchKey} ` +
      `(draw not yet available)`);
  }

  // Upsert prediction
  const result = await pool.query(`
    INSERT INTO ashe_predictions (
      match_key,
      tournament_key,
      tournament_name,
      tour,
      round_normalized,
      player_1_key,
      player_1_name,
      player_2_key,
      player_2_name,
      predicted_winner_key,
      predicted_winner_name,
      confidence_pct,
      confidence_tier,
      first_set_winner_key,
      first_set_winner_name,
      first_set_score,
      market_implied_prob,
      market_edge,
      predicted_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
    )
    ON CONFLICT (tournament_key, round_normalized, player_1_key, player_2_key)
    DO UPDATE SET
      match_key = COALESCE(EXCLUDED.match_key, ashe_predictions.match_key),
      predicted_winner_key = EXCLUDED.predicted_winner_key,
      predicted_winner_name = EXCLUDED.predicted_winner_name,
      confidence_pct = EXCLUDED.confidence_pct,
      confidence_tier = EXCLUDED.confidence_tier,
      first_set_winner_key = EXCLUDED.first_set_winner_key,
      first_set_winner_name = EXCLUDED.first_set_winner_name,
      first_set_score = EXCLUDED.first_set_score,
      market_implied_prob = EXCLUDED.market_implied_prob,
      market_edge = EXCLUDED.market_edge,
      predicted_at = NOW()
    RETURNING id
  `, [
    isOrphaned ? null : matchKey,  // Only set match_key if draw exists
    input.tournament_key,
    input.tournament_name ?? null,
    input.tour ?? null,
    input.round,
    input.player_1_key,
    input.player_1_name ?? null,
    input.player_2_key,
    input.player_2_name ?? null,
    input.predicted_winner_key,
    input.predicted_winner_name,
    input.confidence_pct,
    confidenceTier,
    input.first_set_winner_key ?? null,
    input.first_set_winner_name ?? null,
    input.first_set_score ?? null,
    input.market_implied_prob ?? null,
    input.market_edge ?? null
  ]);

  return {
    success: true,
    id: result.rows[0]?.id,
    match_key: matchKey,
    orphaned: isOrphaned
  };
}

// ============================================================================
// Handler
// ============================================================================

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method not allowed" })
    };
  }

  // Require admin or API key authentication
  const session = parseSessionFromCookies(event.headers.cookie);
  const apiKey = event.headers["x-api-key"] || event.headers["authorization"]?.replace("Bearer ", "");

  const isAuthorized = session?.isAdmin ||
    apiKey === process.env.ORACLE_API_KEY ||
    apiKey === process.env.PREDICTION_API_KEY;

  if (!isAuthorized) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: "Unauthorized" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const pool = getPool();

    // Handle batch or single prediction
    const predictions: PredictionInput[] = body.predictions ?? [body];

    if (predictions.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "No predictions provided" })
      };
    }

    const results: StorageResult[] = [];
    let successCount = 0;
    let orphanCount = 0;

    for (const prediction of predictions) {
      try {
        // Validate required fields
        if (!prediction.tournament_key || !prediction.round ||
            !prediction.player_1_key || !prediction.player_2_key ||
            !prediction.predicted_winner_key || !prediction.predicted_winner_name ||
            prediction.confidence_pct === undefined) {
          results.push({
            success: false,
            orphaned: false,
            error: "Missing required fields"
          });
          continue;
        }

        const result = await storePrediction(pool, prediction);
        results.push(result);

        if (result.success) {
          successCount++;
          if (result.orphaned) orphanCount++;
        }

      } catch (error) {
        results.push({
          success: false,
          orphaned: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    console.log(`[store-prediction] Stored ${successCount}/${predictions.length} predictions ` +
      `(${orphanCount} orphaned)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stored: successCount,
        orphaned: orphanCount,
        total: predictions.length,
        results: predictions.length === 1 ? results[0] : results
      })
    };

  } catch (error) {
    console.error("[store-prediction] Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};

export { handler };
