/**
 * ASHE Drawsheet Query
 *
 * Returns unified draw + prediction data for a tournament.
 * Source of truth is draw_matches (left join ashe_predictions).
 *
 * GET /api/drawsheet?tournament_key=1928
 * GET /api/drawsheet?tournament_name=miami&tour=atp
 *
 * Never throws — always returns a valid structure even if empty.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import { ROUND_ORDER, sortRounds, TIER_EMOJI } from "./draw-utils";

// ============================================================================
// Types
// ============================================================================

interface MatchWithPrediction {
  match_key: string;
  round: string;
  round_order: number;

  // Players
  player_1: {
    key: number;
    name: string;
  };
  player_2: {
    key: number;
    name: string;
  };

  // Schedule
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: "upcoming" | "live" | "finished";

  // Result (if finished)
  winner: {
    key: number;
    name: string;
  } | null;
  final_result: string | null;

  // Prediction
  prediction: {
    status: "available" | "pending";
    winner?: {
      key: number;
      name: string;
    };
    confidence_pct?: number;
    confidence_tier?: string;
    tier_emoji?: string;
    first_set?: {
      winner_key: number;
      winner_name: string;
      score: string;
    };
    market_edge?: number;
    result?: "correct" | "incorrect" | null;
    result_first_set?: "correct" | "incorrect" | null;
  };
}

interface RoundData {
  round: string;
  round_order: number;
  matches: MatchWithPrediction[];
}

interface DrawsheetResponse {
  success: boolean;
  tournament: {
    key: number;
    name: string;
    tour: string | null;
  } | null;
  rounds: RoundData[];
  stats: {
    total_matches: number;
    predictions_available: number;
    predictions_pending: number;
    matches_finished: number;
    predictions_correct: number;
    predictions_incorrect: number;
  };
}

// ============================================================================
// Query
// ============================================================================

async function getDrawsheet(
  tournamentKey?: number,
  tournamentName?: string,
  tour?: string
): Promise<DrawsheetResponse> {
  const pool = getPool();

  // Build WHERE clause
  const conditions: string[] = [];
  const params: (number | string)[] = [];
  let paramIndex = 1;

  if (tournamentKey) {
    conditions.push(`dm.tournament_key = $${paramIndex++}`);
    params.push(tournamentKey);
  }

  if (tournamentName) {
    conditions.push(`LOWER(dm.tournament_name) LIKE $${paramIndex++}`);
    params.push(`%${tournamentName.toLowerCase()}%`);
  }

  if (tour) {
    conditions.push(`UPPER(dm.tour) = $${paramIndex++}`);
    params.push(tour.toUpperCase());
  }

  if (conditions.length === 0) {
    // No filters — return empty response
    return {
      success: true,
      tournament: null,
      rounds: [],
      stats: {
        total_matches: 0,
        predictions_available: 0,
        predictions_pending: 0,
        matches_finished: 0,
        predictions_correct: 0,
        predictions_incorrect: 0
      }
    };
  }

  const whereClause = conditions.join(" AND ");

  // Query draw_matches LEFT JOIN ashe_predictions
  const result = await pool.query(`
    SELECT
      dm.match_key,
      dm.tournament_key,
      dm.tournament_name,
      dm.tour,
      dm.round_normalized,
      dm.player_1_key,
      dm.player_1_name,
      dm.player_2_key,
      dm.player_2_name,
      dm.scheduled_date,
      dm.scheduled_time,
      dm.status,
      dm.winner_key,
      dm.winner_name,
      dm.final_result,
      -- Prediction fields
      ap.id AS prediction_id,
      ap.predicted_winner_key,
      ap.predicted_winner_name,
      ap.confidence_pct,
      ap.confidence_tier,
      ap.first_set_winner_key,
      ap.first_set_winner_name,
      ap.first_set_score,
      ap.market_edge,
      ap.result,
      ap.result_first_set
    FROM draw_matches dm
    LEFT JOIN ashe_predictions ap ON dm.match_key = ap.match_key
    WHERE ${whereClause}
    ORDER BY dm.scheduled_date ASC, dm.scheduled_time ASC
  `, params);

  if (result.rows.length === 0) {
    return {
      success: true,
      tournament: null,
      rounds: [],
      stats: {
        total_matches: 0,
        predictions_available: 0,
        predictions_pending: 0,
        matches_finished: 0,
        predictions_correct: 0,
        predictions_incorrect: 0
      }
    };
  }

  // Extract tournament info from first row
  const firstRow = result.rows[0];
  const tournament = {
    key: firstRow.tournament_key,
    name: firstRow.tournament_name,
    tour: firstRow.tour
  };

  // Group matches by round
  const roundsMap = new Map<string, MatchWithPrediction[]>();

  let predictionsAvailable = 0;
  let predictionsPending = 0;
  let matchesFinished = 0;
  let predictionsCorrect = 0;
  let predictionsIncorrect = 0;

  for (const row of result.rows) {
    const round = row.round_normalized;

    if (!roundsMap.has(round)) {
      roundsMap.set(round, []);
    }

    // Build prediction object
    const hasPrediction = row.prediction_id != null;

    if (hasPrediction) {
      predictionsAvailable++;
      if (row.result === "correct") predictionsCorrect++;
      if (row.result === "incorrect") predictionsIncorrect++;
    } else {
      predictionsPending++;
    }

    if (row.status === "finished") {
      matchesFinished++;
    }

    const match: MatchWithPrediction = {
      match_key: row.match_key,
      round: round,
      round_order: ROUND_ORDER[round] ?? 99,

      player_1: {
        key: row.player_1_key,
        name: row.player_1_name
      },
      player_2: {
        key: row.player_2_key,
        name: row.player_2_name
      },

      scheduled_date: row.scheduled_date ? formatDateForDisplay(row.scheduled_date) : null,
      scheduled_time: row.scheduled_time,
      status: row.status,

      winner: row.winner_key ? {
        key: row.winner_key,
        name: row.winner_name
      } : null,
      final_result: row.final_result,

      prediction: hasPrediction ? {
        status: "available",
        winner: {
          key: row.predicted_winner_key,
          name: row.predicted_winner_name
        },
        confidence_pct: parseFloat(row.confidence_pct),
        confidence_tier: row.confidence_tier,
        tier_emoji: TIER_EMOJI[row.confidence_tier] ?? "",
        first_set: row.first_set_winner_key ? {
          winner_key: row.first_set_winner_key,
          winner_name: row.first_set_winner_name,
          score: row.first_set_score
        } : undefined,
        market_edge: row.market_edge ? parseFloat(row.market_edge) : undefined,
        result: row.result,
        result_first_set: row.result_first_set
      } : {
        status: "pending"
      }
    };

    roundsMap.get(round)!.push(match);
  }

  // Sort rounds in bracket order and build response
  const sortedRoundKeys = sortRounds(Array.from(roundsMap.keys()));

  const rounds: RoundData[] = sortedRoundKeys.map(round => ({
    round,
    round_order: ROUND_ORDER[round] ?? 99,
    matches: roundsMap.get(round)!
  }));

  return {
    success: true,
    tournament,
    rounds,
    stats: {
      total_matches: result.rows.length,
      predictions_available: predictionsAvailable,
      predictions_pending: predictionsPending,
      matches_finished: matchesFinished,
      predictions_correct: predictionsCorrect,
      predictions_incorrect: predictionsIncorrect
    }
  };
}

function formatDateForDisplay(date: Date | string): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  return date.toISOString().split("T")[0];
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

  try {
    const params = event.queryStringParameters ?? {};

    const tournamentKey = params.tournament_key ? parseInt(params.tournament_key) : undefined;
    const tournamentName = params.tournament_name;
    const tour = params.tour;

    if (!tournamentKey && !tournamentName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Missing required parameter: tournament_key or tournament_name"
        })
      };
    }

    const drawsheet = await getDrawsheet(tournamentKey, tournamentName, tour);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(drawsheet)
    };

  } catch (error) {
    console.error("[drawsheet] Error:", error);

    // Never throw — return valid empty structure
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        tournament: null,
        rounds: [],
        stats: {
          total_matches: 0,
          predictions_available: 0,
          predictions_pending: 0,
          matches_finished: 0,
          predictions_correct: 0,
          predictions_incorrect: 0
        },
        error: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};

export { handler };
