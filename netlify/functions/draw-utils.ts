/**
 * ASHE Draw/Prediction Sync Utilities
 * Shared functions for round normalization and match key generation
 */

// ============================================================================
// Round Normalization
// ============================================================================

/**
 * Normalizes raw round strings from api-tennis.com to ASHE standard labels
 *
 * Examples:
 *   "ATP Miami - 1/64-finals" → "R64"
 *   "WTA Miami - Quarter-finals" → "QF"
 *   "Finals - Turin - Final" → "F"
 */
export function normalizeRound(rawRound: string = ""): string {
  if (!rawRound) return "UNKNOWN";
  const r = rawRound.toLowerCase();

  // Check fractional formats FIRST (before "final" check catches them)
  // These are the most common format from api-tennis.com
  if (r.includes("1/128")) return "R128";
  if (r.includes("1/64"))  return "R64";
  if (r.includes("1/32"))  return "R32";
  if (r.includes("1/16"))  return "R16";
  if (r.includes("1/8"))   return "QF";   // Round of 8 = Quarterfinals
  if (r.includes("1/4"))   return "QF";
  if (r.includes("1/2"))   return "SF";

  // Word-based formats
  if (r.includes("semifinal") || r.includes("semi-final"))  return "SF";
  if (r.includes("quarterfinal") || r.includes("quarter-final")) return "QF";
  if (r.includes("round of 128")) return "R128";
  if (r.includes("round of 64"))  return "R64";
  if (r.includes("round of 32"))  return "R32";
  if (r.includes("round of 16"))  return "R16";

  // Numbered rounds (some tournaments use R1, R2, etc.)
  if (r.includes("1st round") || r.includes("first round")) return "R1";
  if (r.includes("2nd round") || r.includes("second round")) return "R2";
  if (r.includes("3rd round") || r.includes("third round")) return "R3";
  if (r.includes("4th round") || r.includes("fourth round")) return "R4";

  // Qualification
  if (r.includes("qualif")) return "Q";

  // Check "final" LAST (so 1/64-finals doesn't match)
  if (r.includes("final") && !r.includes("semi") && !r.includes("quarter") && !r.includes("/")) {
    return "F";
  }

  // Fallback: return raw string (will be logged for review)
  return rawRound;
}

/**
 * Round display order for bracket rendering (early rounds first)
 */
export const ROUND_ORDER: Record<string, number> = {
  "Q":    0,
  "R128": 1,
  "R64":  2,
  "R32":  3,
  "R16":  4,
  "QF":   5,
  "SF":   6,
  "F":    7
};

/**
 * Sorts rounds in bracket order (R128 → F)
 */
export function sortRounds(rounds: string[]): string[] {
  return rounds.sort((a, b) => (ROUND_ORDER[a] ?? 99) - (ROUND_ORDER[b] ?? 99));
}

// ============================================================================
// Match Key Generation
// ============================================================================

/**
 * Builds a stable, canonical match key used to join draw and prediction records
 *
 * Format: {tournament_key}_{round_normalized}_{lo_player_key}_{hi_player_key}
 *
 * Player keys are sorted to ensure order-independence:
 *   buildMatchKey(1928, "QF", 2382, 2072) === buildMatchKey(1928, "QF", 2072, 2382)
 */
export function buildMatchKey(
  tournamentKey: number | string,
  roundNormalized: string,
  playerKeyA: number | string,
  playerKeyB: number | string
): string {
  const [lo, hi] = [String(playerKeyA), String(playerKeyB)].sort();
  return `${tournamentKey}_${roundNormalized}_${lo}_${hi}`;
}

/**
 * Parses a match key back into its components
 */
export function parseMatchKey(matchKey: string): {
  tournamentKey: string;
  round: string;
  playerKeyLo: string;
  playerKeyHi: string;
} | null {
  const parts = matchKey.split("_");
  if (parts.length !== 4) return null;

  return {
    tournamentKey: parts[0],
    round: parts[1],
    playerKeyLo: parts[2],
    playerKeyHi: parts[3]
  };
}

// ============================================================================
// Confidence Tier Calculation
// ============================================================================

/**
 * Determines confidence tier from percentage
 *
 * Tiers:
 *   STRONG    85%+   🟡
 *   CONFIDENT 75-84% 🟤
 *   PICK      65-74% ⬜
 *   LEAN      55-64% ⚪
 *   SKIP      <55%   ⚫
 */
export function getConfidenceTier(confidencePct: number): string {
  if (confidencePct >= 85) return "STRONG";
  if (confidencePct >= 75) return "CONFIDENT";
  if (confidencePct >= 65) return "PICK";
  if (confidencePct >= 55) return "LEAN";
  return "SKIP";
}

/**
 * Tier emoji for display
 */
export const TIER_EMOJI: Record<string, string> = {
  "STRONG":    "🟡",
  "CONFIDENT": "🟤",
  "PICK":      "⬜",
  "LEAN":      "⚪",
  "SKIP":      "⚫"
};

// ============================================================================
// Tour Detection
// ============================================================================

/**
 * Extracts tour type from event_type_type string
 */
export function detectTour(eventTypeType: string | null | undefined): "ATP" | "WTA" | "CHALLENGER" | "ITF" | null {
  if (!eventTypeType) return null;
  const t = eventTypeType.toLowerCase();
  if (t.includes("atp")) return "ATP";
  if (t.includes("wta")) return "WTA";
  if (t.includes("challenger")) return "CHALLENGER";
  if (t.includes("itf")) return "ITF";
  return null;
}

// ============================================================================
// Date/Time Helpers
// ============================================================================

/**
 * Formats date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Gets date range for tournament sync (today + 7 days)
 */
export function getTournamentDateRange(): { start: string; end: string } {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return {
    start: formatDate(today),
    end: formatDate(nextWeek)
  };
}
