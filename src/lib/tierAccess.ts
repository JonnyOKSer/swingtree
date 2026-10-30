/**
 * Subscription tier access rules.
 *
 * The single source of truth for what each tier may see, shared by the React
 * app and the Netlify functions. The server is what actually enforces it —
 * the client copy only decides what to render — so both sides must read the
 * same rules or the paywall and the UI will disagree.
 */

export interface TierAccess {
  // All tiers see all confidence labels (STRONG, CONFIDENT, PICK, SKIP)
  allTournaments: boolean      // false for baseline (Slams + Masters only)
  firstSetWinner: boolean      // false for baseline
  firstSetScore: boolean       // only tree_top
  overUnder: boolean           // false for baseline
  divergence: boolean          // false for baseline
  disruption: boolean          // only tree_top
  earlyAccess: boolean         // only tree_top
  parlay: boolean              // only tree_top - ASHE's parlay picks
}

/**
 * Tournament categories a Baseline subscriber may open.
 *
 * This is what SubscriptionModal advertises as "Grand Slams + Masters only".
 */
export const BASELINE_CATEGORIES = [
  'Grand Slam',
  'ATP 1000',
  'WTA 1000',
  'ATP Finals',
  'WTA Finals',
] as const

/**
 * May this tier open this tournament?
 *
 * Categories arrive from levelToCategory, which falls back to a bare "ATP" or
 * "WTA" when a tournament's level is missing. Those fall through to false, so
 * an event with incomplete metadata is closed to Baseline rather than open by
 * accident — the safe direction for a paywall.
 */
export function isTournamentAccessible(
  category: string,
  tierAccess: Pick<TierAccess, 'allTournaments'>
): boolean {
  if (tierAccess.allTournaments) return true
  if (!category) return false

  const lower = category.toLowerCase()
  return BASELINE_CATEGORIES.some((allowed) => lower.includes(allowed.toLowerCase()))
}

/** Access flags per tier. Trial gets everything for the length of the trial. */
export const TIER_ACCESS: Record<string, TierAccess> = {
  trial: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: true,
    overUnder: true,
    divergence: true,
    disruption: true,
    earlyAccess: true,
    parlay: true,
  },
  baseline: {
    allTournaments: false,  // Slams + Masters only
    firstSetWinner: false,
    firstSetScore: false,
    overUnder: false,
    divergence: false,
    disruption: false,
    earlyAccess: false,
    parlay: false,
  },
  all_court: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: false,   // only tree_top
    overUnder: true,
    divergence: true,
    disruption: false,      // only tree_top
    earlyAccess: false,     // only tree_top
    parlay: false,          // only tree_top
  },
  tree_top: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: true,
    overUnder: true,
    divergence: true,
    disruption: true,
    earlyAccess: true,
    parlay: true,
  },
  expired: {
    allTournaments: false,
    firstSetWinner: false,
    firstSetScore: false,
    overUnder: false,
    divergence: false,
    disruption: false,
    earlyAccess: false,
    parlay: false,
  },
}

/** Access for a tier name, defaulting to the most restrictive set. */
export function accessForTier(tier: string | null | undefined): TierAccess {
  return TIER_ACCESS[tier ?? ''] ?? TIER_ACCESS.expired
}
