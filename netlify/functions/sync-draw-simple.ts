/**
 * Simple Draw Sync - Minimal version that actually works
 *
 * Fetches fixtures from api-tennis.com and syncs to draw_matches.
 * Uses UPSERT to handle conflicts properly.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import { normalizeRound, buildMatchKey, detectTour } from "./draw-utils";

const API_BASE = "https://api.api-tennis.com/tennis/";

interface Fixture {
  event_key: number;
  tournament_key: number;
  tournament_name: string;
  tournament_round: string;
  event_type_type: string;
  event_first_player: string;
  first_player_key: number;
  event_second_player: string;
  second_player_key: number;
  event_date: string;
  event_time: string;
  event_status: string;
  event_winner: string | null;
  event_final_result: string | null;
}

function mapStatus(status: string | null): "upcoming" | "live" | "finished" {
  if (!status) return "upcoming";
  const s = status.toLowerCase();
  if (s === "finished" || s === "ended" || s === "final" || s.includes("retired") || s.includes("walkover")) return "finished";
  if (s.includes("set") || s === "in progress" || s === "live") return "live";
  return "upcoming";
}

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  console.log("[sync-simple] Starting...");

  const apiKey = process.env.ATP_TENNIS_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No API key" }) };
  }

  // Parse date range from body or use defaults
  let dateStart = new Date().toISOString().split('T')[0];
  let dateEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.date_start) dateStart = body.date_start;
      if (body.date_end) dateEnd = body.date_end;
    } catch {}
  }

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "DB connection failed" }) };
  }

  try {
    // Fetch fixtures
    const url = new URL(API_BASE);
    url.searchParams.set("method", "get_fixtures");
    url.searchParams.set("APIkey", apiKey);
    url.searchParams.set("date_start", dateStart);
    url.searchParams.set("date_stop", dateEnd);

    console.log(`[sync-simple] Fetching ${dateStart} to ${dateEnd}`);
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "API error", details: data }) };
    }

    const fixtures: Fixture[] = data.result || [];
    console.log(`[sync-simple] Got ${fixtures.length} fixtures`);

    // Filter to ATP/WTA singles
    const singles = fixtures.filter(f => {
      const t = (f.event_type_type || "").toLowerCase();
      return t.includes("atp singles") || t.includes("wta singles");
    });
    console.log(`[sync-simple] ${singles.length} ATP/WTA singles`);

    let synced = 0;
    let errors = 0;

    for (const f of singles) {
      try {
        const roundNormalized = normalizeRound(f.tournament_round);
        const tour = detectTour(f.event_type_type);
        const status = mapStatus(f.event_status);

        const matchKey = buildMatchKey(
          f.tournament_key,
          roundNormalized,
          f.first_player_key,
          f.second_player_key
        );

        // Determine winner
        let winnerKey: number | null = null;
        let winnerName: string | null = null;
        if (status === "finished" && f.event_winner) {
          if (f.event_winner === f.event_first_player) {
            winnerKey = f.first_player_key;
            winnerName = f.event_first_player;
          } else if (f.event_winner === f.event_second_player) {
            winnerKey = f.second_player_key;
            winnerName = f.event_second_player;
          }
        }

        // UPSERT - insert or update on conflict
        await pool.query(`
          INSERT INTO draw_matches (
            match_key, tournament_key, tournament_name, tour,
            round_raw, round_normalized,
            player_1_key, player_1_name, player_2_key, player_2_name,
            scheduled_date, scheduled_time, event_key, status,
            winner_key, winner_name, final_result
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (match_key) DO UPDATE SET
            status = EXCLUDED.status,
            winner_key = COALESCE(EXCLUDED.winner_key, draw_matches.winner_key),
            winner_name = COALESCE(EXCLUDED.winner_name, draw_matches.winner_name),
            final_result = COALESCE(EXCLUDED.final_result, draw_matches.final_result),
            scheduled_date = COALESCE(EXCLUDED.scheduled_date, draw_matches.scheduled_date),
            scheduled_time = COALESCE(EXCLUDED.scheduled_time, draw_matches.scheduled_time)
        `, [
          matchKey, f.tournament_key, f.tournament_name, tour,
          f.tournament_round, roundNormalized,
          f.first_player_key, f.event_first_player,
          f.second_player_key, f.event_second_player,
          f.event_date || null, f.event_time || null,
          f.event_key, status,
          winnerKey, winnerName, f.event_final_result
        ]);

        synced++;
      } catch (err) {
        errors++;
        console.error(`[sync-simple] Error syncing fixture:`, err);
      }
    }

    console.log(`[sync-simple] Done: ${synced} synced, ${errors} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dateRange: { start: dateStart, end: dateEnd },
        totalFixtures: fixtures.length,
        singlesFixtures: singles.length,
        synced,
        errors
      })
    };

  } catch (error) {
    console.error("[sync-simple] Fatal error:", error);
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
