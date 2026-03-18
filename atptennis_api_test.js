/**
 * ASHE — api-tennis.com API Test Script
 * Tests draw, round, and fixture data for Miami Open ATP & WTA
 *
 * Run: API_TENNIS_KEY=your_key node steveg_api_test.js
 * Or set API_TENNIS_KEY in .env / environment
 */

const API_KEY = process.env.ATP_TENNIS_KEY;
const BASE_URL = "https://api.api-tennis.com/tennis/";

if (!API_KEY) {
  console.error("ERROR: ATP_TENNIS_KEY environment variable not set");
  console.error("Usage: ATP_TENNIS_KEY=your_key node steveg_api_test.js");
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function get(method, params = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error === "1" || data.error === 1) {
    throw new Error(`${method} → API Error: ${JSON.stringify(data.result)}`);
  }
  return data;
}

function hr(label) {
  console.log(`\n${"─".repeat(60)}`);
  if (label) console.log(`  ${label}`);
  console.log("─".repeat(60));
}

function dump(obj, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

// ─── Round normalizer (for ASHE drawsheet) ──────────────────────────────────
// api-tennis returns round as a string like "Miami Open Men - Quarter-finals"
// This maps it to ASHE's clean round labels

function normalizeRound(rawRound = "") {
  const r = rawRound.toLowerCase();

  // Check fractional formats FIRST (before "final" check catches them)
  if (r.includes("1/128")) return "R128";
  if (r.includes("1/64"))  return "R64";
  if (r.includes("1/32"))  return "R32";
  if (r.includes("1/16"))  return "R16";
  if (r.includes("1/8"))   return "QF";   // Round of 8 = Quarterfinals
  if (r.includes("1/4"))   return "QF";
  if (r.includes("1/2"))   return "SF";

  // Then check word-based formats
  if (r.includes("semifinal") || r.includes("semi-final"))  return "SF";
  if (r.includes("quarterfinal") || r.includes("quarter-final")) return "QF";
  if (r.includes("round of 128")) return "R128";
  if (r.includes("round of 64"))  return "R64";
  if (r.includes("round of 32"))  return "R32";
  if (r.includes("round of 16"))  return "R16";
  if (r.includes("1st round") || r.includes("first round")) return "R1";
  if (r.includes("2nd round") || r.includes("second round")) return "R2";
  if (r.includes("3rd round") || r.includes("third round")) return "R3";
  if (r.includes("4th round") || r.includes("fourth round")) return "R4";
  if (r.includes("qualif")) return "Q";

  // Check "final" LAST (so 1/64-finals doesn't match)
  if (r.includes("final") && !r.includes("semi") && !r.includes("quarter") && !r.includes("/")) return "F";

  return rawRound; // fallback: return raw
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function test_tournaments() {
  hr("TEST 1 — All Tournaments (find Miami Open key)");
  const data = await get("get_tournaments");
  const results = data.result ?? [];

  // Filter for Miami
  const miami = results.filter(t =>
    t.tournament_name?.toLowerCase().includes("miami")
  );

  console.log(`  Total tournaments: ${results.length}`);
  console.log(`  Miami matches:`);
  dump(miami);

  // Also show ATP 1000 / Masters tournaments
  const masters = results.filter(t =>
    t.tournament_name?.toLowerCase().includes("1000") ||
    t.tournament_name?.toLowerCase().includes("masters")
  );
  console.log(`\n  Masters/1000 tournaments: ${masters.length}`);
  if (masters.length > 0) {
    dump(masters.slice(0, 5));
  }

  return miami;
}

async function test_event_types() {
  hr("TEST 1b — Event Types (subscription coverage)");
  const data = await get("get_events");
  const results = data.result ?? [];

  console.log(`  Event types available: ${results.length}`);
  dump(results);
  return results;
}

async function test_fixtures_by_date() {
  hr("TEST 2 — Fixtures today (draws/matchups/rounds)");

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const data  = await get("get_fixtures", {
    date_start: today,
    date_stop:  today,
  });

  const results = data.result ?? [];
  const atp = results.filter(r => r.event_type_type?.toLowerCase().includes("atp"));
  const wta = results.filter(r => r.event_type_type?.toLowerCase().includes("wta"));

  console.log(`  Total fixtures today: ${results.length}`);
  console.log(`  ATP: ${atp.length}  |  WTA: ${wta.length}`);

  // Show first 3 ATP with round data
  console.log("\n  Sample ATP fixtures:");
  for (const f of atp.slice(0, 3)) {
    console.log(`
    ${f.event_first_player} vs ${f.event_second_player}
       Tournament:  ${f.tournament_name}
       Raw round:   ${f.tournament_round || "(empty)"}
       ASHE round:  ${normalizeRound(f.tournament_round)}
       Date/Time:   ${f.event_date} ${f.event_time}
       Status:      ${f.event_status || "upcoming"}
       Winner:      ${f.event_winner || "-"}
       Result:      ${f.event_final_result || "-"}
    `);
  }

  return results;
}

async function test_fixtures_miami() {
  hr("TEST 3 — Miami Open fixtures (next 7 days)");

  const today    = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const fmt = d => d.toISOString().split("T")[0];

  const data = await get("get_fixtures", {
    date_start: fmt(today),
    date_stop:  fmt(nextWeek),
  });

  const results = data.result ?? [];
  const miami   = results.filter(r =>
    r.tournament_name?.toLowerCase().includes("miami")
  );

  console.log(`  Total fixtures (7 days): ${results.length}`);
  console.log(`  Miami Open fixtures:     ${miami.length}`);

  if (miami.length === 0) {
    console.log("  No Miami fixtures found in date range — may not be scheduled yet.");
    console.log("  Checking what tournaments ARE available:");
    const tourneys = [...new Set(results.map(r => r.tournament_name))].slice(0, 10);
    tourneys.forEach(t => console.log(`    - ${t}`));
    return;
  }

  console.log("\n  Full Miami draw sample:");
  for (const f of miami.slice(0, 10)) {
    const round = normalizeRound(f.tournament_round);
    console.log(
      `  [${round.padEnd(4)}] ${(f.event_first_player || "TBD").padEnd(22)} vs ${(f.event_second_player || "TBD").padEnd(22)} | ${f.event_date} | ${f.event_status || "upcoming"}`
    );
  }

  // Show unique rounds in the draw
  const rounds = [...new Set(miami.map(r => r.tournament_round).filter(Boolean))];
  console.log("\n  Unique rounds found:");
  rounds.forEach(r => console.log(`    "${r}"  =>  ${normalizeRound(r)}`));

  return miami;
}

async function test_live() {
  hr("TEST 4 — Live matches right now");
  const data    = await get("get_livescore");
  const results = data.result ?? [];

  console.log(`  Live matches: ${results.length}`);
  if (results.length > 0) {
    console.log("\n  Sample live match:");
    dump(results[0]);
  } else {
    console.log("  No live matches at this moment.");
  }
}

async function test_h2h(player1Key, player2Key, label) {
  hr(`TEST 5 — H2H data (${label})`);
  const data = await get("get_H2H", {
    first_player_key:  player1Key,
    second_player_key: player2Key,
  });
  const h2h = data.result?.H2H ?? [];
  console.log(`  H2H meetings: ${h2h.length}`);
  if (h2h.length > 0) {
    console.log("  Last 3 meetings:");
    for (const m of h2h.slice(0, 3)) {
      console.log(`    ${m.event_first_player} vs ${m.event_second_player} | ${m.tournament_round} | ${m.event_final_result} | ${m.event_date}`);
    }
  }
}

async function test_standings() {
  hr("TEST 6 — ATP Rankings");
  const data = await get("get_standings", { event_type: "ATP" });
  const results = data.result ?? [];

  console.log(`  Total ranked players: ${results.length}`);
  if (results.length > 0) {
    console.log("  Sample ranking entry (for field discovery):");
    dump(results[0]);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━".repeat(60));
  console.log("  ASHE × api-tennis.com — Draw & Round Test");
  console.log("━".repeat(60));
  console.log(`  API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);
  console.log(`  Date: ${new Date().toISOString().split("T")[0]}`);

  try { await test_event_types(); }
  catch (e) { console.error("  ERROR test_event_types:", e.message); }

  try { await test_tournaments(); }
  catch (e) { console.error("  ERROR test_tournaments:", e.message); }

  try { await test_fixtures_by_date(); }
  catch (e) { console.error("  ERROR test_fixtures_by_date:", e.message); }

  try { await test_fixtures_miami(); }
  catch (e) { console.error("  ERROR test_fixtures_miami:", e.message); }

  try { await test_live(); }
  catch (e) { console.error("  ERROR test_live:", e.message); }

  // Sinner vs Alcaraz — correct player keys from rankings
  try { await test_h2h("2072", "2382", "Sinner vs Alcaraz"); }
  catch (e) { console.error("  ERROR test_h2h:", e.message); }

  try { await test_standings(); }
  catch (e) { console.error("  ERROR test_standings:", e.message); }

  console.log("\n" + "━".repeat(60));
  console.log("  Done. Key things to verify:");
  console.log("  1. tournament_round field — populated for ATP/WTA 1000s?");
  console.log("  2. Round normalizer — does it map cleanly to R128->F?");
  console.log("  3. Miami draw — are all rounds present or just today's?");
  console.log("  4. event_winner populated on completed matches?");
  console.log("  5. Player keys for H2H — are they consistent?");
  console.log("━".repeat(60));
}

main().catch(console.error);
