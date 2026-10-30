/**
 * Tournament naming helpers.
 *
 * These lived inside the tournaments handler, which meant the only way to test
 * them was to copy them into the test file — so the tests checked a copy that
 * was free to drift from the code, and had in fact grown a function
 * (determineTournamentStatus) that never existed in the handler at all.
 * Hoisting them here lets the tests import the real thing.
 *
 * The job is harder than it looks because one event reaches us under several
 * names at once. The prediction log carries whatever the data feed called the
 * event that week — usually the sponsored name — while the tournaments table
 * carries the official one. Left alone they become two tournaments on the map:
 * "Dongfeng Voyah Wuhan" next to "Wuhan Open", "Toray Pan Pacific Open Tennis"
 * next to "Tokyo", "Swiss Indoors" next to "Basel".
 *
 * Three rules, in order, collapse them:
 *   1. fold accents and drop the suffixes that decorate a name
 *   2. drop a leading sponsor (SPONSOR_PREFIXES)
 *   3. look up what is left in EVENT_CITY, for events named after neither
 *      their city nor anything we could derive
 *
 * Both tables are the maintenance point: a new sponsor or a renamed event is
 * one line here, not a code change.
 */

/** "Città" and "Rhône" must slug the same way their unaccented spellings do. */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Sponsors that sit in front of the event name. Anchored at the start and at a
 * word boundary, and never applied if they would consume the whole name.
 */
const SPONSOR_PREFIXES: RegExp[] = [
  /^Dongfeng Voyah\b/i,
  /^Vanda Pharmaceuticals\b/i,
  /^Fayez Sarofim (& Co\.?)?\b/i,
  /^Abierto GNP Seguros\b/i,
  /^Hana Bank\b/i,
  /^BNB\b/i,
  /^Toray\b/i,
  /^Mutua\b/i,
  /^Rolex\b/i,
  /^Cinch\b/i,
  /^Nitto\b/i,
]

/**
 * Decoration at the end of a name. Applied repeatedly until nothing more comes
 * off, so "Toray Pan Pacific Open Tennis" loses both " Tennis" and " Open".
 */
const NAME_SUFFIXES: RegExp[] = [
  / Masters$/i,
  / Open$/i,
  / Championships?$/i,
  / Tennis$/i,
  / Ladies$/i,
  / Women'?s$/i,
  / Men'?s$/i,
]

/**
 * Events whose name contains no hint of where they are played, so no amount of
 * trimming will ever match what the other source calls them.
 * Keys are normalised names (lower case, already stripped); values are the
 * canonical identity, which is the host city except where a city holds more
 * than one event of the same tour — London has both Wimbledon and Queen's, so
 * Queen's canonicalises to itself rather than to London.
 */
const EVENT_CITY: Record<string, string> = {
  'swiss indoors': 'Basel',
  'pan pacific': 'Tokyo',
  'japan': 'Tokyo',
  'china': 'Beijing',
  'bnp paribas': 'Indian Wells',
  'indian wells': 'Indian Wells',
  'western & southern': 'Cincinnati',
  'western and southern': 'Cincinnati',
  "internazionali bnl d'italia": 'Rome',
  'internazionali bnl ditalia': 'Rome',
  'italian': 'Rome',
  'canadian': 'Canada',
  'canada': 'Canada',
  'national bank': 'Canada',
  'french': 'Roland Garros',
  'roland garros': 'Roland Garros',
  'monte carlo': 'Monte-Carlo',
  'monte-carlo': 'Monte-Carlo',
  'miami': 'Miami',
  'porsche tennis grand prix': 'Stuttgart',
  'bmw': 'Munich',
  'tiriac': 'Bucharest',
  'grand prix hassan ii': 'Marrakech',
  'u.s. clay court championship': 'Houston',
  "u.s. men's clay court championship": 'Houston',
  'qatar exxonmobil': 'Doha',
  'qatar': 'Doha',
  'dubai duty free tennis': 'Dubai',
  "queen's club": "Queen's Club",
  'queens': "Queen's Club",
}

/** How a canonical city should read on screen, where the city is not the name. */
const CITY_DISPLAY: Record<string, string> = {
  'Indian Wells': 'Indian Wells',
  'Miami': 'Miami Open',
  'Monte-Carlo': 'Monte-Carlo Masters',
  'Roland Garros': 'Roland Garros',
}

/**
 * Strip the decoration that makes the same event look like several, keeping
 * the name's own spelling — accents and all — so it stays fit to show.
 */
export function stripDecoration(name: string): string {
  // Trim first: the suffix patterns are anchored to the end of the string, so
  // a trailing space used to stop them matching and " Miami Open " would
  // survive as its own tournament alongside "Miami".
  let out = name.trim()

  // "Tiriac Open presented by UniCredit Bank", "BMW Open by Bitpanda"
  const sponsoredTail = out.replace(/\s+(?:presented by|sponsored by|by)\s+.+$/i, '').trim()
  if (sponsoredTail) out = sponsoredTail

  for (const prefix of SPONSOR_PREFIXES) {
    const stripped = out.replace(prefix, '').trim()
    // A sponsor that eats the whole name was not a prefix — leave it alone.
    if (stripped && stripped !== out) {
      out = stripped
      break
    }
  }

  // Suffixes stack, so keep going until a pass changes nothing.
  let previous: string
  do {
    previous = out
    for (const suffix of NAME_SUFFIXES) {
      const stripped = out.replace(suffix, '').trim()
      // What is left has to still be a name. "The Championships" must not
      // become "The", and a one-word event must not be stripped to nothing.
      if (stripped.length >= 3 && !/^(the|le|la|el)$/i.test(stripped)) out = stripped
    }
  } while (out !== previous)

  return out.trim()
}

/**
 * The same thing, folded to plain ASCII. Matching and keys go through this so
 * "Citta" and "Città" cannot become two tournaments; display does not, because
 * the accent is part of the name.
 */
export function normalizeName(name: string): string {
  return foldAccents(stripDecoration(name))
}

/**
 * The city an event belongs to — the one identity both data sources agree on.
 * Returns null when the name is already its own best identity.
 */
export function resolveCity(name: string): string | null {
  const normalized = normalizeName(name).toLowerCase()
  if (!normalized) return null
  if (EVENT_CITY[normalized]) return EVENT_CITY[normalized]
  // A sponsor we have never seen can still be shaken off when the city itself
  // survives in the name: "Some Sponsor Wuhan" ends in a city we know.
  for (const [key, city] of Object.entries(EVENT_CITY)) {
    if (normalized.endsWith(` ${key}`)) return city
  }
  return null
}

/** Canonical display name for an event with several common spellings. */
export function getDisplayName(name: string): string {
  const city = resolveCity(name)
  if (city) return CITY_DISPLAY[city] || city
  return stripDecoration(name)
}

/**
 * Deduplication key. The tour is part of the key so the ATP and WTA draws of a
 * combined event stay separate.
 */
export function getCanonicalKey(name: string, tour: string = 'ATP'): string {
  const city = resolveCity(name)
  const base = (city || normalizeName(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

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
