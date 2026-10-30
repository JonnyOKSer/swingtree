/**
 * Tournament naming helpers.
 *
 * These lived inside the tournaments handler, which meant the only way to test
 * them was to copy them into the test file — so the tests checked a copy that
 * was free to drift from the code, and had in fact grown a function
 * (determineTournamentStatus) that never existed in the handler at all.
 * Hoisting them here lets the tests import the real thing.
 */

/** Strip the suffixes that make the same event look like several. */
export function normalizeName(name: string): string {
  // Trim first: the suffix patterns are anchored to the end of the string, so
  // a trailing space used to stop them matching and " Miami Open " would
  // survive as its own tournament alongside "Miami".
  return name
    .trim()
    .replace(/ Masters$/i, '')
    .replace(/ Open$/i, '')
    .replace(/ Championships$/i, '')
    .trim()
}

/** Canonical display name for an event with several common spellings. */
export function getDisplayName(name: string): string {
  const normalized = normalizeName(name).toLowerCase()
  if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) return 'Indian Wells'
  if (normalized.includes('miami')) return 'Miami Open'
  if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) return 'Monte-Carlo Masters'
  if (normalized.includes('roland garros') || normalized.includes('french')) return 'Roland Garros'
  return normalizeName(name)
}

/**
 * Deduplication key. The tour is part of the key so the ATP and WTA draws of a
 * combined event stay separate.
 */
export function getCanonicalKey(name: string, tour: string = 'ATP'): string {
  const normalized = normalizeName(name).toLowerCase()
  let base = normalized
  if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) base = 'indian-wells'
  else if (normalized.includes('miami')) base = 'miami'
  else if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) base = 'monte-carlo'
  else if (normalized.includes('roland garros') || normalized.includes('french')) base = 'roland-garros'
  else base = normalized.replace(/[^a-z0-9]/g, '-')

  return `${base}-${tour.toLowerCase()}`
}

/** Human-readable round labels. */
export const ROUND_DISPLAY: Record<string, string> = {
  'F': 'Final',
  'SF': 'Semifinals',
  'QF': 'Quarterfinals',
  'R16': 'Round of 16',
  'R32': 'Round of 32',
  'R64': 'Round of 64',
  'R128': 'Round of 128'
}
