/**
 * Fix Live Status - Updates draw_matches status using ESPN data
 *
 * Updates BOTH:
 * - "live" matches that are now finished
 * - "upcoming" matches that are past their scheduled date and now finished
 *
 * This fixes stale statuses when api-tennis.com sync fails to update them.
 * Does NOT use api-tennis.com API.
 *
 * GET /api/fix-live-status
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getPool } from "./db";

const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard';
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard';

interface EspnMatch {
  player1: string;
  player2: string;
  winner: string;
  score: string;
  tour: 'ATP' | 'WTA';
}

function normalizePlayerName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+Jr\.?$/i, '')
    .trim()
    .toLowerCase();
}

function playersMatch(name1: string, name2: string): boolean {
  const n1 = normalizePlayerName(name1);
  const n2 = normalizePlayerName(name2);
  if (n1 === n2) return true;

  const lastName1 = n1.split(' ').pop() || '';
  const lastName2 = n2.split(' ').pop() || '';
  return lastName1 === lastName2 && lastName1.length > 2;
}

async function fetchCompletedMatches(tour: 'ATP' | 'WTA'): Promise<EspnMatch[]> {
  const url = tour === 'ATP' ? ESPN_ATP_URL : ESPN_WTA_URL;
  const matches: EspnMatch[] = [];

  try {
    const response = await fetch(url);
    if (!response.ok) return matches;

    const data = await response.json();

    for (const event of data.events || []) {
      const singlesSlug = tour === 'ATP' ? 'mens-singles' : 'womens-singles';

      for (const grouping of event.groupings || []) {
        if (grouping.grouping?.slug !== singlesSlug) continue;

        for (const comp of grouping.competitions || []) {
          if (!comp.status?.type?.completed) continue;

          const competitors = comp.competitors || [];
          if (competitors.length < 2) continue;

          const player1 = competitors[0]?.athlete?.displayName || 'TBD';
          const player2 = competitors[1]?.athlete?.displayName || 'TBD';
          const winner = competitors.find((c: any) => c.winner)?.athlete?.displayName;

          if (!winner) continue;

          // Extract score from notes or linescores
          let score = '';
          const notes = comp.notes || [];
          const eventNote = notes.find((n: any) => n.type === 'event');
          if (eventNote?.text) {
            // Format: "Player A (COUNTRY) bt Player B (COUNTRY) 6-4 7-5"
            const scoreMatch = eventNote.text.match(/\d+-\d+(?:\s+\d+-\d+)*/);
            if (scoreMatch) score = scoreMatch[0];
          }

          matches.push({ player1, player2, winner, score, tour });
        }
      }
    }
  } catch (error) {
    console.error(`[fix-live] Error fetching ESPN ${tour}:`, error);
  }

  return matches;
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

  console.log(`[fix-live] Starting at ${new Date().toISOString()}`);

  const pool = getPool();

  try {
    // Get BOTH live matches AND stale upcoming matches (scheduled before today)
    // This catches matches that api-tennis.com failed to update
    const staleResult = await pool.query(`
      SELECT match_key, player_1_name, player_2_name, tour, tournament_name, status, scheduled_date
      FROM draw_matches
      WHERE (
        status = 'live'
        OR (status = 'upcoming' AND scheduled_date < CURRENT_DATE)
      )
      AND player_1_name IS NOT NULL
      AND player_2_name IS NOT NULL
      ORDER BY scheduled_date DESC
      LIMIT 100
    `);

    console.log(`[fix-live] Found ${staleResult.rows.length} stale matches (live or overdue upcoming)`);

    if (staleResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "No stale matches to update",
          updated: 0
        })
      };
    }

    // Fetch completed matches from ESPN
    const [atpMatches, wtaMatches] = await Promise.all([
      fetchCompletedMatches('ATP'),
      fetchCompletedMatches('WTA')
    ]);

    const completedMatches = [...atpMatches, ...wtaMatches];
    console.log(`[fix-live] Found ${completedMatches.length} completed matches from ESPN`);

    let updated = 0;
    const updates: string[] = [];

    // Match stale matches against completed ESPN matches
    for (const dbMatch of staleResult.rows) {
      for (const espnMatch of completedMatches) {
        const matchesP1 = playersMatch(dbMatch.player_1_name, espnMatch.player1) ||
                          playersMatch(dbMatch.player_1_name, espnMatch.player2);
        const matchesP2 = playersMatch(dbMatch.player_2_name, espnMatch.player1) ||
                          playersMatch(dbMatch.player_2_name, espnMatch.player2);

        if (matchesP1 && matchesP2) {
          // Found the match - update to finished with winner and score
          await pool.query(`
            UPDATE draw_matches
            SET status = 'finished',
                winner_name = $2,
                final_result = COALESCE($3, final_result),
                updated_at = NOW()
            WHERE match_key = $1
          `, [dbMatch.match_key, espnMatch.winner, espnMatch.score || null]);

          updated++;
          const prevStatus = dbMatch.status;
          updates.push(`[${prevStatus}] ${dbMatch.player_1_name} vs ${dbMatch.player_2_name} → ${espnMatch.winner} (${espnMatch.score || 'no score'})`);
          console.log(`[fix-live] Updated ${prevStatus}: ${dbMatch.player_1_name} vs ${dbMatch.player_2_name}`);
          break;
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        staleMatches: staleResult.rows.length,
        espnCompleted: completedMatches.length,
        updated,
        updates
      })
    };

  } catch (error) {
    console.error("[fix-live] Error:", error);
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
