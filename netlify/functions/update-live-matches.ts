/**
 * Update Live Matches
 *
 * A lightweight, targeted function that checks api-tennis.com for status updates
 * on matches currently marked as "live" in our database.
 *
 * This runs every 5 minutes and is much faster than a full sync because it only
 * queries matches we're actively tracking as live.
 *
 * Scheduled: Every 5 minutes via Netlify scheduled functions
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";

const API_BASE = "https://api.api-tennis.com/tennis/";

interface ApiTennisFixture {
  event_key: number;
  event_status: string;
  event_winner: string | null;
  event_final_result: string | null;
  event_first_player: string;
  event_second_player: string;
  first_player_key: number;
  second_player_key: number;
}

function mapEventStatus(status: string | null): "upcoming" | "live" | "finished" {
  if (!status) return "upcoming";
  const s = status.toLowerCase();
  if (s === "finished" || s === "ended" || s === "final" || s === "retired" || s === "walkover") return "finished";
  if (s.includes("set") || s === "in progress" || s === "live") return "live";
  return "upcoming";
}

async function fetchFixtureByEventKey(eventKey: number): Promise<ApiTennisFixture | null> {
  const apiKey = process.env.ATP_TENNIS_KEY;
  if (!apiKey) {
    throw new Error("ATP_TENNIS_KEY environment variable not set");
  }

  const url = new URL(API_BASE);
  url.searchParams.set("method", "get_events");
  url.searchParams.set("APIkey", apiKey);
  url.searchParams.set("event_id", String(eventKey));

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error === "1" || data.error === 1) {
      console.log(`[update-live] No data for event ${eventKey}`);
      return null;
    }

    return data.result?.[0] ?? null;
  } catch (error) {
    console.error(`[update-live] Error fetching event ${eventKey}:`, error);
    return null;
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  console.log(`[update-live] Starting at ${new Date().toISOString()}`);

  // Check API key early
  const apiKey = process.env.ATP_TENNIS_KEY;
  if (!apiKey) {
    console.error("[update-live] ATP_TENNIS_KEY not set");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "ATP_TENNIS_KEY environment variable not set"
      })
    };
  }

  let pool;
  try {
    pool = getPool();
  } catch (dbError) {
    console.error("[update-live] Database connection error:", dbError);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: `Database connection error: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      })
    };
  }

  try {
    // Get all matches currently marked as "live"
    const liveMatches = await pool.query(`
      SELECT match_key, event_key, player_1_name, player_2_name, tournament_name
      FROM draw_matches
      WHERE status = 'live'
        AND event_key IS NOT NULL
      LIMIT 50
    `);

    if (liveMatches.rows.length === 0) {
      console.log("[update-live] No live matches to update");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "No live matches to update",
          updated: 0
        })
      };
    }

    console.log(`[update-live] Found ${liveMatches.rows.length} live matches to check`);

    let updated = 0;
    const updates: Array<{ match: string; oldStatus: string; newStatus: string }> = [];

    // Check each live match for status updates
    for (const match of liveMatches.rows) {
      const fixture = await fetchFixtureByEventKey(match.event_key);

      if (!fixture) continue;

      const newStatus = mapEventStatus(fixture.event_status);

      if (newStatus === "finished") {
        // Determine winner
        let winnerKey: number | null = null;
        let winnerName: string | null = null;

        if (fixture.event_winner) {
          if (fixture.event_winner === fixture.event_first_player) {
            winnerKey = fixture.first_player_key;
            winnerName = fixture.event_first_player;
          } else if (fixture.event_winner === fixture.event_second_player) {
            winnerKey = fixture.second_player_key;
            winnerName = fixture.event_second_player;
          }
        }

        // Update the match
        await pool.query(`
          UPDATE draw_matches
          SET status = 'finished',
              winner_key = COALESCE($2, winner_key),
              winner_name = COALESCE($3, winner_name),
              final_result = COALESCE($4, final_result)
          WHERE match_key = $1
        `, [match.match_key, winnerKey, winnerName, fixture.event_final_result]);

        updated++;
        updates.push({
          match: `${match.player_1_name} vs ${match.player_2_name}`,
          oldStatus: "live",
          newStatus: "finished"
        });

        console.log(`[update-live] Updated ${match.player_1_name} vs ${match.player_2_name} to finished`);
      }
    }

    console.log(`[update-live] Complete: ${updated} matches updated to finished`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checked: liveMatches.rows.length,
        updated,
        updates
      })
    };

  } catch (error) {
    console.error("[update-live] Error:", error);
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
