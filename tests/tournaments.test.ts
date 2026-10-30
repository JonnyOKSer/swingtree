import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  stripDecoration,
  foldAccents,
  resolveCity,
  getDisplayName,
  getCanonicalKey,
  ROUND_DISPLAY,
} from '../netlify/functions/tournament-utils'

describe('normalizeName', () => {
  it('strips the suffixes that make one event look like several', () => {
    expect(normalizeName('Indian Wells Masters')).toBe('Indian Wells')
    expect(normalizeName('Miami Open')).toBe('Miami')
    expect(normalizeName('Cincinnati Championships')).toBe('Cincinnati')
  })

  it('only strips a suffix at the end', () => {
    expect(normalizeName('Masters Cup')).toBe('Masters Cup')
    expect(normalizeName('Open 13 Provence')).toBe('Open 13 Provence')
  })

  it('is case-insensitive about the suffix and trims', () => {
    expect(normalizeName('Miami OPEN')).toBe('Miami')
    expect(normalizeName('  Miami Open  ')).toBe('Miami')
  })

  it('leaves a name with no suffix alone', () => {
    expect(normalizeName('Roland Garros')).toBe('Roland Garros')
    expect(normalizeName('')).toBe('')
  })
})

describe('getDisplayName', () => {
  it('collapses the many spellings of the same event', () => {
    for (const name of ['Indian Wells Masters', 'BNP Paribas Open', 'indian wells']) {
      expect(getDisplayName(name)).toBe('Indian Wells')
    }
    for (const name of ['Miami Open', 'Miami Masters']) {
      expect(getDisplayName(name)).toBe('Miami Open')
    }
    for (const name of ['Monte Carlo Masters', 'Monte-Carlo Masters']) {
      expect(getDisplayName(name)).toBe('Monte-Carlo Masters')
    }
    for (const name of ['Roland Garros', 'French Open']) {
      expect(getDisplayName(name)).toBe('Roland Garros')
    }
  })

  it('falls back to the normalised name', () => {
    expect(getDisplayName('Barcelona Open')).toBe('Barcelona')
    expect(getDisplayName('Wimbledon')).toBe('Wimbledon')
  })
})

describe('getCanonicalKey', () => {
  it('keeps the two tours of a combined event apart', () => {
    expect(getCanonicalKey('Indian Wells Masters', 'ATP')).toBe('indian-wells-atp')
    expect(getCanonicalKey('Indian Wells Masters', 'WTA')).toBe('indian-wells-wta')
    expect(getCanonicalKey('Indian Wells Masters', 'ATP'))
      .not.toBe(getCanonicalKey('Indian Wells Masters', 'WTA'))
  })

  it('gives every spelling of one event the same key', () => {
    expect(getCanonicalKey('BNP Paribas Open', 'ATP')).toBe(getCanonicalKey('Indian Wells Masters', 'ATP'))
    expect(getCanonicalKey('French Open', 'ATP')).toBe(getCanonicalKey('Roland Garros', 'ATP'))
    expect(getCanonicalKey('Monte Carlo Masters', 'ATP')).toBe(getCanonicalKey('Monte-Carlo Masters', 'ATP'))
  })

  it('defaults to ATP', () => {
    expect(getCanonicalKey('Miami Open')).toBe(getCanonicalKey('Miami Open', 'ATP'))
  })

  it('slugs anything it does not recognise', () => {
    expect(getCanonicalKey('Barcelona Open', 'ATP')).toBe('barcelona-atp')
    expect(getCanonicalKey("Queen's Club Championships", 'ATP')).toBe('queen-s-club-atp')
  })

  it('lower-cases the tour so casing cannot split a key', () => {
    expect(getCanonicalKey('Miami Open', 'wta')).toBe(getCanonicalKey('Miami Open', 'WTA'))
  })
})

// ============================================================================
// The duplicate-tournament bug
//
// One event arrives under two names at once: the prediction log carries what
// the feed called it that week (usually the sponsored name) and the
// tournaments table carries the official one. Every pair below was showing up
// twice on the live map.
// ============================================================================

describe('sponsored and official names of one event', () => {
  const sameEvent: Array<[string, string, string]> = [
    ['Dongfeng Voyah Wuhan', 'Wuhan Open', 'WTA'],
    ['Toray Pan Pacific Open Tennis', 'Tokyo', 'WTA'],
    ['Swiss Indoors', 'Basel', 'ATP'],
    ['China Open', 'Beijing', 'ATP'],
    ['China Open', 'Beijing', 'WTA'],
    ['BNB Ningbo', 'Ningbo', 'WTA'],
    ["Vanda Pharmaceuticals Mallorca Women's", 'Mallorca', 'WTA'],
    ['Japan Open', 'Tokyo', 'ATP'],
    ['Rolex Monte-Carlo Masters', 'Monte Carlo', 'ATP'],
    ['Mutua Madrid Open', 'Madrid', 'ATP'],
    ['Miami Open presented by Itau', 'Miami Masters', 'ATP'],
    ['BNP Paribas Open', 'Indian Wells', 'ATP'],
    ["Internazionali BNL d'Italia", 'Rome', 'ATP'],
    ['BMW Open by Bitpanda', 'BMW Open', 'ATP'],
    ['Tiriac Open presented by UniCredit Bank', 'Tiriac Open', 'ATP'],
  ]

  it.each(sameEvent)('gives %s and %s one key on the %s tour', (sponsored, official, tour) => {
    expect(getCanonicalKey(sponsored, tour)).toBe(getCanonicalKey(official, tour))
  })

  it.each(sameEvent)('shows %s and %s under one name', (sponsored, official) => {
    expect(getDisplayName(sponsored)).toBe(getDisplayName(official))
  })

  it('still keeps the two tours of a merged event apart', () => {
    // Tokyo holds the ATP Japan Open and the WTA Pan Pacific. Same city, two
    // tournaments — collapsing them would be the opposite bug.
    expect(getCanonicalKey('Japan Open', 'ATP'))
      .not.toBe(getCanonicalKey('Toray Pan Pacific Open Tennis', 'WTA'))
  })
})

describe('events that must NOT be merged', () => {
  it('keeps two events in one city apart', () => {
    // London holds Wimbledon and Queen's; Madrid holds the 1000 and a WTA 125.
    expect(getCanonicalKey('Wimbledon', 'ATP')).not.toBe(getCanonicalKey("Queen's Club", 'ATP'))
    expect(getCanonicalKey('Madrid Open', 'WTA'))
      .not.toBe(getCanonicalKey('Grand Prix Open Villa de Madrid by Silverway', 'WTA'))
  })

  it('leaves a name it has never seen intact', () => {
    expect(getDisplayName('Lisboa Belem')).toBe('Lisboa Belem')
    expect(getCanonicalKey('Grand Prix Auvergne-Rhone-Alpes', 'ATP'))
      .toBe('grand-prix-auvergne-rhone-alpes-atp')
  })

  it('never strips a name down to a fragment', () => {
    // " Championships" off "The Championships" would leave "The".
    expect(normalizeName('The Championships')).toBe('The Championships')
    expect(normalizeName('Open')).toBe('Open')
    expect(normalizeName('BNB')).toBe('BNB')
    expect(normalizeName('Toray')).toBe('Toray')
  })
})

describe('sponsor stripping', () => {
  it('drops a leading sponsor', () => {
    expect(stripDecoration('Dongfeng Voyah Wuhan')).toBe('Wuhan')
    expect(stripDecoration('BNB Ningbo')).toBe('Ningbo')
    expect(stripDecoration('Rolex Shanghai Masters')).toBe('Shanghai')
  })

  it('drops a trailing sponsorship clause', () => {
    expect(stripDecoration('Miami Open presented by Itau')).toBe('Miami')
    expect(stripDecoration('BMW Open by Bitpanda')).toBe('BMW')
  })

  it('peels stacked suffixes in one go', () => {
    expect(stripDecoration('Toray Pan Pacific Open Tennis')).toBe('Pan Pacific')
    expect(stripDecoration("Vanda Pharmaceuticals Mallorca Women's")).toBe('Mallorca')
    expect(stripDecoration("Valle D'Aosta Ladies")).toBe("Valle D'Aosta")
  })

  it('only strips a sponsor at a word boundary', () => {
    expect(stripDecoration('BNBX Cup')).toBe('BNBX Cup')
  })
})

describe('accents', () => {
  it('folds them for matching', () => {
    expect(foldAccents('Città della Pace')).toBe('Citta della Pace')
    expect(normalizeName('Auvergne-Rhône-Alpes')).toBe('Auvergne-Rhone-Alpes')
  })

  it('keeps them for display', () => {
    expect(getDisplayName('RoveretOpen Città della Pace')).toBe('RoveretOpen Città della Pace')
    expect(getDisplayName('Grand Prix Auvergne-Rhône-Alpes')).toBe('Grand Prix Auvergne-Rhône-Alpes')
  })

  it('gives an accented and unaccented spelling the same key', () => {
    expect(getCanonicalKey('Città della Pace', 'WTA')).toBe(getCanonicalKey('Citta della Pace', 'WTA'))
  })

  it('leaves no empty segment in a slug where an accent was', () => {
    expect(getCanonicalKey('RoveretOpen Città della Pace', 'WTA'))
      .toBe('roveretopen-citta-della-pace-wta')
  })
})

describe('resolveCity', () => {
  it('names the event an alias points at', () => {
    expect(resolveCity('Swiss Indoors')).toBe('Basel')
    expect(resolveCity('China Open')).toBe('Beijing')
  })

  it('shakes off a sponsor it has never heard of', () => {
    // SPONSOR_PREFIXES cannot list next season's sponsors. When the part we do
    // recognise survives at the end of the name, that is still enough.
    expect(resolveCity('Some New Sponsor China Open')).toBe('Beijing')
    expect(resolveCity('Acme Bank Swiss Indoors')).toBe('Basel')
    expect(getCanonicalKey('Some New Sponsor China Open', 'ATP'))
      .toBe(getCanonicalKey('Beijing', 'ATP'))
  })

  it('does not treat a longer name as an alias just because it contains one', () => {
    // "Madrid" is not an alias key, so the WTA 125 in Madrid stays itself —
    // and an alias has to end the name, not merely appear in it.
    expect(resolveCity('China Open Juniors')).toBeNull()
  })

  it('returns null when the name is already its own identity', () => {
    expect(resolveCity('Almaty')).toBeNull()
    expect(resolveCity('Lisboa Belem')).toBeNull()
    expect(resolveCity('')).toBeNull()
  })
})

describe('ROUND_DISPLAY', () => {
  it('labels every round the bracket can show', () => {
    expect(ROUND_DISPLAY.F).toBe('Final')
    expect(ROUND_DISPLAY.SF).toBe('Semifinals')
    expect(ROUND_DISPLAY.QF).toBe('Quarterfinals')
    expect(ROUND_DISPLAY.R16).toBe('Round of 16')
    expect(ROUND_DISPLAY.R32).toBe('Round of 32')
    expect(ROUND_DISPLAY.R64).toBe('Round of 64')
    expect(ROUND_DISPLAY.R128).toBe('Round of 128')
  })

  it('has no label for a round it does not know', () => {
    expect(ROUND_DISPLAY.Q).toBeUndefined()
  })
})
