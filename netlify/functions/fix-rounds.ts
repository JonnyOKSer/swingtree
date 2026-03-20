/**
 * Fix Rounds - Updates draw_matches with correct round info from api-tennis
 *
 * Fixes matches that have round_normalized = "UNKNOWN" by fetching
 * current data from api-tennis.com
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";
import { normalizeRound, buildMatchKey, detectTour } from "./draw-utils";

const API_BASE = "https://api.api-tennis.com/tennis/";

interface ApiTennisFixture {
  event_key: number;
  tournament_key: number;
  tournament_name: string;
  tournament_round: string;
  event_type_type: string;
  event_first_player: string;
  first_player_key: number;
  event_second_player: string;
  second_player_key: number;
  event_status: string;
  event_winner: string | null;
  event_final_result: string | null;
}

function mapEventStatus(status: string | null): "upcoming" | "live" | "finished" {
  if (!status) return "upcoming";
  const s = status.toLowerCase();
  if (s === "finished" || s === "ended" || s === "final" || s === "retired" || s === "walkover") return "finished";
  if (s.includes("set") || s === "in progress" || s === "live") return "live";
  return "upcoming";
}

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  const apiKey = process.env.ATP_TENNIS_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "ATP_TENNIS_KEY not set" })
    };
  }

  const pool = getPool();

  try {
    // Get matches with UNKNOWN round
    const unknownResult = await pool.query(`
      SELECT DISTINCT tournament_key, tournament_name
      FROM draw_matches
      WHERE round_normalized = 'UNKNOWN'
      LIMIT 5
    `);

    if (unknownResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "No UNKNOWN rounds to fix",
          fixed: 0
        })
      };
    }

    // Get date range (last 3 days to today + 7 days)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 3);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);

    const dateStart = startDate.toISOString().split('T')[0];
    const dateEnd = endDate.toISOString().split('T')[0];

    // Fetch fixtures from api-tennis
    const url = new URL(API_BASE);
    url.searchParams.set("method", "get_fixtures");
    url.searchParams.set("APIkey", apiKey);
    url.searchParams.set("date_start", dateStart);
    url.searchParams.set("date_stop", dateEnd);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error === "1" || data.error === 1) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "API Tennis error", details: data.result })
      };
    }

    const fixtures: ApiTennisFixture[] = data.result || [];

    // Filter to ATP/WTA singles
    const singlesFixtures = fixtures.filter(f => {
      const t = f.event_type_type.toLowerCase();
      return t.includes("atp singles") || t.includes("wta singles");
    });

    let fixed = 0;
    const updates: string[] = [];

    // Update matches
    for (const fixture of singlesFixtures) {
      const roundNormalized = normalizeRound(fixture.tournament_round);
      if (roundNormalized === "UNKNOWN" || roundNormalized === fixture.tournament_round) continue;

      const tour = detectTour(fixture.event_type_type);
      const status = mapEventStatus(fixture.event_status);

      // Build new match key with correct round
      const newMatchKey = buildMatchKey(
        fixture.tournament_key,
        roundNormalized,
        fixture.first_player_key,
        fixture.second_player_key
      );

      // Also build old match key with UNKNOWN
      const oldMatchKey = buildMatchKey(
        fixture.tournament_key,
        "UNKNOWN",
        fixture.first_player_key,
        fixture.second_player_key
      );

      // Determine winner
      let winnerKey: number | null = null;
      let winnerName: string | null = null;
      if (status === "finished" && fixture.event_winner) {
        if (fixture.event_winner === fixture.event_first_player) {
          winnerKey = fixture.first_player_key;
          winnerName = fixture.event_first_player;
        } else if (fixture.event_winner === fixture.event_second_player) {
          winnerKey = fixture.second_player_key;
          winnerName = fixture.event_second_player;
        }
      }

      // Update the UNKNOWN match with correct round (don't change match_key to avoid conflicts)
      const updateResult = await pool.query(`
        UPDATE draw_matches
        SET round_normalized = $1,
            round_raw = $2,
            status = $3,
            winner_key = COALESCE($4, winner_key),
            winner_name = COALESCE($5, winner_name),
            final_result = COALESCE($6, final_result),
            event_key = $7
        WHERE match_key = $8
        RETURNING match_key
      `, [
        roundNormalized, fixture.tournament_round,
        status, winnerKey, winnerName, fixture.event_final_result,
        fixture.event_key, oldMatchKey
      ]);

      if (updateResult.rowCount > 0) {
        fixed++;
        updates.push(`${fixture.event_first_player} vs ${fixture.event_second_player}: UNKNOWN → ${roundNormalized}`);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        fixturesChecked: singlesFixtures.length,
        fixed,
        updates: updates.slice(0, 20)
      })
    };

  } catch (error) {
    console.error("[fix-rounds] Error:", error);
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
