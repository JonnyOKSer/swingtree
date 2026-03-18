/**
 * ASHE Draw Sync
 *
 * Fetches tournament draw data from api-tennis.com and upserts into draw_matches.
 * Resolves orphaned predictions that arrived before the draw.
 *
 * Triggered:
 *   - Scheduled: Every 15 minutes during tournament weeks
 *   - Manual: POST /api/sync-draw with { tournament_key, date_start?, date_end? }
 *
 * Fully idempotent — safe to re-run at any time.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import {
  normalizeRound,
  buildMatchKey,
  detectTour,
  formatDate,
  getTournamentDateRange
} from "./draw-utils";

// ============================================================================
// Types
// ============================================================================

interface ApiTennisFixture {
  event_key: number;
  event_date: string;
  event_time: string;
  event_first_player: string;
  first_player_key: number;
  event_second_player: string;
  second_player_key: number;
  event_final_result: string | null;
  event_winner: string | null;
  event_status: string;
  event_type_type: string;
  tournament_name: string;
  tournament_key: number;
  tournament_round: string;
}

interface SyncResult {
  tournament_key: number;
  tournament_name: string;
  matches_synced: number;
  orphans_resolved: number;
  errors: string[];
}

// ============================================================================
// API Tennis Client
// ============================================================================

const API_BASE = "https://api.api-tennis.com/tennis/";

async function fetchFixtures(params: {
  date_start: string;
  date_end: string;
  tournament_key?: number;
}): Promise<ApiTennisFixture[]> {
  const apiKey = process.env.ATP_TENNIS_KEY;
  if (!apiKey) {
    throw new Error("ATP_TENNIS_KEY environment variable not set");
  }

  const url = new URL(API_BASE);
  url.searchParams.set("method", "get_fixtures");
  url.searchParams.set("APIkey", apiKey);
  url.searchParams.set("date_start", params.date_start);
  url.searchParams.set("date_stop", params.date_end);

  if (params.tournament_key) {
    url.searchParams.set("tournament_key", String(params.tournament_key));
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error === "1" || data.error === 1) {
    throw new Error(`API Tennis error: ${JSON.stringify(data.result)}`);
  }

  return data.result ?? [];
}

// ============================================================================
// Match Status Mapping
// ============================================================================

function mapEventStatus(status: string | null): "upcoming" | "live" | "finished" {
  if (!status) return "upcoming";
  const s = status.toLowerCase();
  if (s === "finished" || s === "ended" || s === "final") return "finished";
  if (s.includes("set") || s === "in progress" || s === "live") return "live";
  return "upcoming";
}

// ============================================================================
// Sync Logic
// ============================================================================

async function syncDrawFromFixtures(fixtures: ApiTennisFixture[]): Promise<SyncResult[]> {
  const pool = getPool();
  const results: Map<number, SyncResult> = new Map();

  // Group fixtures by tournament
  const byTournament = new Map<number, ApiTennisFixture[]>();
  for (const f of fixtures) {
    if (!byTournament.has(f.tournament_key)) {
      byTournament.set(f.tournament_key, []);
    }
    byTournament.get(f.tournament_key)!.push(f);
  }

  // Process each tournament
  for (const [tournamentKey, tournamentFixtures] of Array.from(byTournament.entries())) {
    const result: SyncResult = {
      tournament_key: tournamentKey,
      tournament_name: tournamentFixtures[0]?.tournament_name ?? "Unknown",
      matches_synced: 0,
      orphans_resolved: 0,
      errors: []
    };

    for (const fixture of tournamentFixtures) {
      try {
        // Normalize round
        const roundNormalized = normalizeRound(fixture.tournament_round);

        // Build stable match key
        const matchKey = buildMatchKey(
          fixture.tournament_key,
          roundNormalized,
          fixture.first_player_key,
          fixture.second_player_key
        );

        // Detect tour
        const tour = detectTour(fixture.event_type_type);

        // Map status
        const status = mapEventStatus(fixture.event_status);

        // Determine winner if finished
        let winnerKey: number | null = null;
        let winnerName: string | null = null;
        if (status === "finished" && fixture.event_winner) {
          // event_winner contains the winner's name
          if (fixture.event_winner === fixture.event_first_player) {
            winnerKey = fixture.first_player_key;
            winnerName = fixture.event_first_player;
          } else if (fixture.event_winner === fixture.event_second_player) {
            winnerKey = fixture.second_player_key;
            winnerName = fixture.event_second_player;
          }
        }

        // Upsert into draw_matches
        await pool.query(`
          INSERT INTO draw_matches (
            match_key,
            tournament_key,
            tournament_name,
            tour,
            round_raw,
            round_normalized,
            player_1_key,
            player_1_name,
            player_2_key,
            player_2_name,
            scheduled_date,
            scheduled_time,
            event_key,
            status,
            winner_key,
            winner_name,
            final_result,
            draw_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
          ON CONFLICT (match_key) DO UPDATE SET
            status = EXCLUDED.status,
            winner_key = COALESCE(EXCLUDED.winner_key, draw_matches.winner_key),
            winner_name = COALESCE(EXCLUDED.winner_name, draw_matches.winner_name),
            final_result = COALESCE(EXCLUDED.final_result, draw_matches.final_result),
            scheduled_date = COALESCE(EXCLUDED.scheduled_date, draw_matches.scheduled_date),
            scheduled_time = COALESCE(EXCLUDED.scheduled_time, draw_matches.scheduled_time),
            updated_at = NOW()
        `, [
          matchKey,
          fixture.tournament_key,
          fixture.tournament_name,
          tour,
          fixture.tournament_round,
          roundNormalized,
          fixture.first_player_key,
          fixture.event_first_player,
          fixture.second_player_key,
          fixture.event_second_player,
          fixture.event_date || null,
          fixture.event_time || null,
          fixture.event_key,
          status,
          winnerKey,
          winnerName,
          fixture.event_final_result
        ]);

        result.matches_synced++;

        // Attempt to resolve orphaned predictions for this match
        const orphanResolved = await resolveOrphanedPrediction(
          pool,
          matchKey,
          fixture.tournament_key,
          roundNormalized,
          fixture.first_player_key,
          fixture.second_player_key
        );

        if (orphanResolved) {
          result.orphans_resolved++;
        }

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Match ${fixture.event_key}: ${errMsg}`);
        console.error(`[sync-draw] Error processing fixture:`, error);
      }
    }

    results.set(tournamentKey, result);
  }

  return Array.from(results.values());
}

/**
 * Attempts to resolve an orphaned prediction by matching on tournament + round + players
 */
async function resolveOrphanedPrediction(
  pool: ReturnType<typeof getPool>,
  matchKey: string,
  tournamentKey: number,
  roundNormalized: string,
  playerKey1: number,
  playerKey2: number
): Promise<boolean> {
  // Find orphaned prediction matching these criteria
  // Player keys could be in either order
  const result = await pool.query(`
    UPDATE ashe_predictions
    SET match_key = $1,
        orphan_logged_at = NULL
    WHERE match_key IS NULL
      AND tournament_key = $2
      AND round_normalized = $3
      AND (
        (player_1_key = $4 AND player_2_key = $5) OR
        (player_1_key = $5 AND player_2_key = $4)
      )
    RETURNING id
  `, [matchKey, tournamentKey, roundNormalized, playerKey1, playerKey2]);

  return result.rowCount > 0;
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

  console.log(`[sync-draw] Starting sync at ${new Date().toISOString()}`);

  try {
    // Parse parameters
    let dateStart: string;
    let dateEnd: string;
    let tournamentKey: number | undefined;

    if (event.httpMethod === "POST" && event.body) {
      const body = JSON.parse(event.body);
      dateStart = body.date_start ?? formatDate(new Date());
      dateEnd = body.date_end ?? formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      tournamentKey = body.tournament_key;
    } else {
      // Default: sync next 7 days
      const range = getTournamentDateRange();
      dateStart = range.start;
      dateEnd = range.end;
    }

    console.log(`[sync-draw] Fetching fixtures from ${dateStart} to ${dateEnd}`);

    // Fetch fixtures from api-tennis.com
    const fixtures = await fetchFixtures({
      date_start: dateStart,
      date_end: dateEnd,
      tournament_key: tournamentKey
    });

    // Filter to ATP/WTA singles only (skip doubles, ITF for now)
    const singlesFixtures = fixtures.filter(f => {
      const t = f.event_type_type.toLowerCase();
      return (t.includes("atp singles") || t.includes("wta singles"));
    });

    console.log(`[sync-draw] Found ${fixtures.length} total fixtures, ${singlesFixtures.length} ATP/WTA singles`);

    // Sync to database
    const results = await syncDrawFromFixtures(singlesFixtures);

    // Summary
    const totalSynced = results.reduce((sum, r) => sum + r.matches_synced, 0);
    const totalOrphans = results.reduce((sum, r) => sum + r.orphans_resolved, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`[sync-draw] Complete: ${totalSynced} matches synced, ${totalOrphans} orphans resolved, ${totalErrors} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        date_range: { start: dateStart, end: dateEnd },
        fixtures_fetched: singlesFixtures.length,
        matches_synced: totalSynced,
        orphans_resolved: totalOrphans,
        tournaments: results
      })
    };

  } catch (error) {
    console.error("[sync-draw] Error:", error);
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
