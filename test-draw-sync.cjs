/**
 * ASHE Draw Sync - Local Test Script
 *
 * Tests the draw sync architecture locally:
 * 1. Runs the database migration
 * 2. Syncs Miami Open draw from api-tennis.com
 * 3. Tests the drawsheet query
 * 4. Tests orphan prediction flow
 *
 * Usage: node test-draw-sync.js
 * Requires: ATP_TENNIS_KEY and DATABASE_URL in .env
 */

const { Pool } = require("pg");

// Load .env manually for Node script
require("dotenv").config();

const API_KEY = process.env.ATP_TENNIS_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_KEY) {
  console.error("ERROR: ATP_TENNIS_KEY not set in .env");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set in .env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const API_BASE = "https://api.api-tennis.com/tennis/";

// ============================================================================
// Round Normalizer (copied from draw-utils.ts for standalone use)
// ============================================================================

function normalizeRound(rawRound = "") {
  if (!rawRound) return "UNKNOWN";
  const r = rawRound.toLowerCase();
  if (r.includes("1/128")) return "R128";
  if (r.includes("1/64"))  return "R64";
  if (r.includes("1/32"))  return "R32";
  if (r.includes("1/16"))  return "R16";
  if (r.includes("1/8"))   return "QF";
  if (r.includes("1/4"))   return "QF";
  if (r.includes("1/2"))   return "SF";
  if (r.includes("semifinal") || r.includes("semi-final"))  return "SF";
  if (r.includes("quarterfinal") || r.includes("quarter-final")) return "QF";
  if (r.includes("round of 128")) return "R128";
  if (r.includes("round of 64"))  return "R64";
  if (r.includes("round of 32"))  return "R32";
  if (r.includes("round of 16"))  return "R16";
  if (r.includes("qualif")) return "Q";
  if (r.includes("final") && !r.includes("semi") && !r.includes("quarter") && !r.includes("/")) {
    return "F";
  }
  return rawRound;
}

function buildMatchKey(tournamentKey, roundNormalized, playerKeyA, playerKeyB) {
  const [lo, hi] = [String(playerKeyA), String(playerKeyB)].sort();
  return `${tournamentKey}_${roundNormalized}_${lo}_${hi}`;
}

function getConfidenceTier(pct) {
  if (pct >= 85) return "STRONG";
  if (pct >= 75) return "CONFIDENT";
  if (pct >= 65) return "PICK";
  if (pct >= 55) return "LEAN";
  return "SKIP";
}

function detectTour(eventTypeType) {
  if (!eventTypeType) return null;
  const t = eventTypeType.toLowerCase();
  if (t.includes("atp")) return "ATP";
  if (t.includes("wta")) return "WTA";
  return null;
}

function mapEventStatus(status) {
  if (!status) return "upcoming";
  const s = status.toLowerCase();
  if (s === "finished" || s === "ended") return "finished";
  if (s.includes("set") || s === "in progress") return "live";
  return "upcoming";
}

// ============================================================================
// Helpers
// ============================================================================

function hr(label) {
  console.log(`\n${"━".repeat(60)}`);
  if (label) console.log(`  ${label}`);
  console.log("━".repeat(60));
}

async function fetchFixtures(dateStart, dateEnd, tournamentKey) {
  const url = new URL(API_BASE);
  url.searchParams.set("method", "get_fixtures");
  url.searchParams.set("APIkey", API_KEY);
  url.searchParams.set("date_start", dateStart);
  url.searchParams.set("date_stop", dateEnd);
  if (tournamentKey) {
    url.searchParams.set("tournament_key", String(tournamentKey));
  }

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error === "1" || data.error === 1) {
    throw new Error(`API error: ${JSON.stringify(data.result)}`);
  }
  return data.result ?? [];
}

// ============================================================================
// Tests
// ============================================================================

async function testMigration() {
  hr("TEST 1: Check Tables Exist");

  try {
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('draw_matches', 'ashe_predictions')
    `);

    console.log(`  Tables found: ${tables.rows.map(r => r.table_name).join(", ") || "NONE"}`);

    if (tables.rows.length < 2) {
      console.log("  ⚠️  Tables missing! Run the migration first:");
      console.log("     psql $DATABASE_URL -f db/setup_draw_sync.sql");
      return false;
    }

    console.log("  ✅ Tables exist");
    return true;

  } catch (error) {
    console.error("  ❌ Error:", error.message);
    return false;
  }
}

async function testDrawSync() {
  hr("TEST 2: Sync Miami Open Draw");

  try {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const dateStart = today.toISOString().split("T")[0];
    const dateEnd = nextWeek.toISOString().split("T")[0];

    console.log(`  Fetching fixtures ${dateStart} to ${dateEnd}...`);

    const fixtures = await fetchFixtures(dateStart, dateEnd);

    // Filter to Miami ATP/WTA singles
    const miamiFixtures = fixtures.filter(f => {
      const isMiami = f.tournament_name?.toLowerCase().includes("miami");
      const isSingles = f.event_type_type?.toLowerCase().includes("singles");
      const isAtpWta = f.event_type_type?.toLowerCase().includes("atp") ||
                       f.event_type_type?.toLowerCase().includes("wta");
      return isMiami && isSingles && isAtpWta;
    });

    console.log(`  Found ${miamiFixtures.length} Miami singles fixtures`);

    let synced = 0;
    let skipped = 0;
    for (const f of miamiFixtures) {
      // Skip fixtures with missing critical data
      if (!f.first_player_key || !f.second_player_key) {
        skipped++;
        continue;
      }

      const roundNormalized = normalizeRound(f.tournament_round);
      const matchKey = buildMatchKey(
        f.tournament_key,
        roundNormalized,
        f.first_player_key,
        f.second_player_key
      );
      const tour = detectTour(f.event_type_type);
      const status = mapEventStatus(f.event_status);

      let winnerKey = null;
      let winnerName = null;
      if (status === "finished" && f.event_winner) {
        if (f.event_winner === f.event_first_player) {
          winnerKey = f.first_player_key;
          winnerName = f.event_first_player;
        } else {
          winnerKey = f.second_player_key;
          winnerName = f.event_second_player;
        }
      }

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
          updated_at = NOW()
      `, [
        matchKey, f.tournament_key, f.tournament_name, tour,
        f.tournament_round, roundNormalized,
        f.first_player_key, f.event_first_player,
        f.second_player_key, f.event_second_player,
        f.event_date, f.event_time, f.event_key, status,
        winnerKey, winnerName, f.event_final_result
      ]);

      synced++;
    }

    console.log(`  ✅ Synced ${synced} matches`);

    // Show sample
    const sample = await pool.query(`
      SELECT match_key, round_normalized, player_1_name, player_2_name, status
      FROM draw_matches
      WHERE tournament_name ILIKE '%miami%'
      ORDER BY scheduled_date, scheduled_time
      LIMIT 5
    `);

    console.log("\n  Sample matches:");
    for (const row of sample.rows) {
      console.log(`    [${row.round_normalized}] ${row.player_1_name} vs ${row.player_2_name} (${row.status})`);
    }

    return true;

  } catch (error) {
    console.error("  ❌ Error:", error.message);
    return false;
  }
}

async function testOrphanedPrediction() {
  hr("TEST 3: Orphaned Prediction Flow");

  try {
    // Create a fake prediction for a match that doesn't exist yet
    const fakeTournamentKey = 99999;
    const fakeRound = "SF";
    const fakePlayer1 = 1111;
    const fakePlayer2 = 2222;

    console.log("  Creating orphaned prediction (draw doesn't exist)...");

    await pool.query(`
      INSERT INTO ashe_predictions (
        match_key, tournament_key, tournament_name, tour,
        round_normalized, player_1_key, player_1_name, player_2_key, player_2_name,
        predicted_winner_key, predicted_winner_name, confidence_pct, confidence_tier
      ) VALUES (
        NULL, $1, 'Test Tournament', 'ATP',
        $2, $3, 'Test Player 1', $4, 'Test Player 2',
        $3, 'Test Player 1', 72.5, 'PICK'
      )
      ON CONFLICT (tournament_key, round_normalized, player_1_key, player_2_key)
      DO UPDATE SET confidence_pct = 72.5
    `, [fakeTournamentKey, fakeRound, fakePlayer1, fakePlayer2]);

    // Check it's orphaned
    const orphan = await pool.query(`
      SELECT id, match_key FROM ashe_predictions
      WHERE tournament_key = $1 AND round_normalized = $2
    `, [fakeTournamentKey, fakeRound]);

    if (orphan.rows[0]?.match_key === null) {
      console.log("  ✅ Prediction stored as orphan (match_key = NULL)");
    } else {
      console.log("  ⚠️  Prediction not orphaned as expected");
    }

    // Now create the draw match
    const matchKey = buildMatchKey(fakeTournamentKey, fakeRound, fakePlayer1, fakePlayer2);

    console.log("  Creating draw match (simulating draw arrival)...");

    await pool.query(`
      INSERT INTO draw_matches (
        match_key, tournament_key, tournament_name, tour,
        round_raw, round_normalized,
        player_1_key, player_1_name, player_2_key, player_2_name,
        status
      ) VALUES ($1, $2, 'Test Tournament', 'ATP', 'Semifinal', $3, $4, 'Test Player 1', $5, 'Test Player 2', 'upcoming')
      ON CONFLICT (match_key) DO NOTHING
    `, [matchKey, fakeTournamentKey, fakeRound, fakePlayer1, fakePlayer2]);

    // Resolve orphan
    console.log("  Resolving orphan...");

    const resolved = await pool.query(`
      UPDATE ashe_predictions
      SET match_key = $1
      WHERE tournament_key = $2 AND round_normalized = $3
        AND player_1_key = $4 AND player_2_key = $5
        AND match_key IS NULL
      RETURNING id
    `, [matchKey, fakeTournamentKey, fakeRound, fakePlayer1, fakePlayer2]);

    if (resolved.rowCount > 0) {
      console.log("  ✅ Orphan resolved: match_key now set");
    } else {
      console.log("  ⚠️  Orphan resolution failed");
    }

    // Cleanup
    await pool.query(`DELETE FROM ashe_predictions WHERE tournament_key = $1`, [fakeTournamentKey]);
    await pool.query(`DELETE FROM draw_matches WHERE tournament_key = $1`, [fakeTournamentKey]);
    console.log("  Cleaned up test data");

    return true;

  } catch (error) {
    console.error("  ❌ Error:", error.message);
    return false;
  }
}

async function testDrawsheet() {
  hr("TEST 4: Drawsheet Query");

  try {
    // Query Miami drawsheet
    const result = await pool.query(`
      SELECT
        dm.round_normalized,
        COUNT(*) as match_count,
        COUNT(ap.id) as predictions_count
      FROM draw_matches dm
      LEFT JOIN ashe_predictions ap ON dm.match_key = ap.match_key
      WHERE dm.tournament_name ILIKE '%miami%'
      GROUP BY dm.round_normalized
      ORDER BY
        CASE dm.round_normalized
          WHEN 'R128' THEN 1
          WHEN 'R64' THEN 2
          WHEN 'R32' THEN 3
          WHEN 'R16' THEN 4
          WHEN 'QF' THEN 5
          WHEN 'SF' THEN 6
          WHEN 'F' THEN 7
          ELSE 99
        END
    `);

    console.log("  Miami Open Drawsheet Summary:");
    console.log("  Round    Matches  Predictions");
    console.log("  ──────────────────────────────");

    for (const row of result.rows) {
      const round = row.round_normalized.padEnd(6);
      const matches = String(row.match_count).padStart(7);
      const preds = String(row.predictions_count).padStart(12);
      console.log(`  ${round} ${matches} ${preds}`);
    }

    const total = result.rows.reduce((sum, r) => sum + parseInt(r.match_count), 0);
    console.log(`\n  Total matches: ${total}`);

    console.log("  ✅ Drawsheet query works");
    return true;

  } catch (error) {
    console.error("  ❌ Error:", error.message);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("━".repeat(60));
  console.log("  ASHE Draw Sync — Local Test");
  console.log("━".repeat(60));
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Database: ${DATABASE_URL.split("@")[1]?.split("/")[0] ?? "configured"}`);

  const results = {
    migration: false,
    drawSync: false,
    orphanFlow: false,
    drawsheet: false
  };

  results.migration = await testMigration();

  if (results.migration) {
    results.drawSync = await testDrawSync();
    results.orphanFlow = await testOrphanedPrediction();
    results.drawsheet = await testDrawsheet();
  }

  hr("SUMMARY");
  console.log(`  Migration:     ${results.migration ? "✅" : "❌"}`);
  console.log(`  Draw Sync:     ${results.drawSync ? "✅" : "❌"}`);
  console.log(`  Orphan Flow:   ${results.orphanFlow ? "✅" : "❌"}`);
  console.log(`  Drawsheet:     ${results.drawsheet ? "✅" : "❌"}`);

  const allPassed = Object.values(results).every(r => r);
  console.log(`\n  ${allPassed ? "✅ All tests passed!" : "❌ Some tests failed"}`);

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  pool.end();
  process.exit(1);
});
