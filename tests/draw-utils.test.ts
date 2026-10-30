import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  normalizeRound,
  ROUND_ORDER,
  sortRounds,
  buildMatchKey,
  parseMatchKey,
  getConfidenceTier,
  TIER_EMOJI,
  detectTour,
  formatDate,
  getTournamentDateRange,
} from '../netlify/functions/draw-utils'

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------- round normalising */

describe('normalizeRound', () => {
  it('reads the fractional format api-tennis actually sends', () => {
    expect(normalizeRound('ATP Miami - 1/128-finals')).toBe('R128')
    expect(normalizeRound('ATP Miami - 1/64-finals')).toBe('R64')
    expect(normalizeRound('ATP Miami - 1/32-finals')).toBe('R32')
    expect(normalizeRound('ATP Miami - 1/16-finals')).toBe('R16')
    expect(normalizeRound('ATP Miami - 1/2-finals')).toBe('SF')
  })

  it('treats both 1/8 and 1/4 as quarterfinals', () => {
    // 1/8 is "round of 8", which is the quarterfinals, not the round of 16
    expect(normalizeRound('WTA Miami - 1/8-finals')).toBe('QF')
    expect(normalizeRound('WTA Miami - 1/4-finals')).toBe('QF')
  })

  it('does not mistake a fractional round for the final', () => {
    // the whole reason "final" is checked last
    expect(normalizeRound('ATP Miami - 1/64-finals')).not.toBe('F')
    expect(normalizeRound('Finals - Turin - Final')).toBe('F')
    expect(normalizeRound('Final')).toBe('F')
  })

  it('reads word formats, hyphenated or not', () => {
    expect(normalizeRound('Semifinals')).toBe('SF')
    expect(normalizeRound('Semi-finals')).toBe('SF')
    expect(normalizeRound('Quarterfinals')).toBe('QF')
    expect(normalizeRound('Quarter-finals')).toBe('QF')
    expect(normalizeRound('Round of 128')).toBe('R128')
    expect(normalizeRound('Round of 64')).toBe('R64')
    expect(normalizeRound('Round of 32')).toBe('R32')
    expect(normalizeRound('Round of 16')).toBe('R16')
  })

  it('does not let semi- or quarter-finals fall through to F', () => {
    expect(normalizeRound('Semifinal')).toBe('SF')
    expect(normalizeRound('Quarterfinal')).toBe('QF')
  })

  it('reads numbered and qualifying rounds', () => {
    expect(normalizeRound('1st Round')).toBe('R1')
    expect(normalizeRound('First Round')).toBe('R1')
    expect(normalizeRound('2nd Round')).toBe('R2')
    expect(normalizeRound('3rd Round')).toBe('R3')
    expect(normalizeRound('4th Round')).toBe('R4')
    expect(normalizeRound('Qualification Round 1')).toBe('Q')
    expect(normalizeRound('Qualifying')).toBe('Q')
  })

  it('is case-insensitive', () => {
    expect(normalizeRound('SEMIFINALS')).toBe('SF')
    expect(normalizeRound('atp miami - 1/64-FINALS')).toBe('R64')
  })

  it('returns UNKNOWN for nothing, and echoes anything unrecognised', () => {
    expect(normalizeRound('')).toBe('UNKNOWN')
    expect(normalizeRound(undefined)).toBe('UNKNOWN')
    expect(normalizeRound('Exhibition Match')).toBe('Exhibition Match')
  })
})

/* ------------------------------------------------------------- round order */

describe('sortRounds', () => {
  it('puts early rounds first', () => {
    expect(sortRounds(['F', 'R64', 'SF', 'R128', 'QF', 'R16', 'R32']))
      .toEqual(['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'])
  })

  it('pushes unknown rounds to the back rather than dropping them', () => {
    const sorted = sortRounds(['F', 'Mystery', 'R16'])
    expect(sorted[sorted.length - 1]).toBe('Mystery')
    expect(sorted).toHaveLength(3)
  })

  it('orders every round it knows about consistently', () => {
    const known = Object.keys(ROUND_ORDER)
    const sorted = sortRounds([...known].reverse())
    const values = sorted.map((r) => ROUND_ORDER[r])
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })
})

/* --------------------------------------------------------------- match keys */

describe('buildMatchKey', () => {
  it('is independent of the order the players are given in', () => {
    expect(buildMatchKey(1928, 'QF', 2382, 2072)).toBe(buildMatchKey(1928, 'QF', 2072, 2382))
  })

  it('separates different tournaments and rounds', () => {
    expect(buildMatchKey(1928, 'QF', 1, 2)).not.toBe(buildMatchKey(1929, 'QF', 1, 2))
    expect(buildMatchKey(1928, 'QF', 1, 2)).not.toBe(buildMatchKey(1928, 'SF', 1, 2))
  })

  it('accepts numbers or strings for the keys', () => {
    expect(buildMatchKey('1928', 'QF', '2072', '2382')).toBe(buildMatchKey(1928, 'QF', 2072, 2382))
  })

  it('round-trips through parseMatchKey', () => {
    const parsed = parseMatchKey(buildMatchKey(1928, 'QF', 2382, 2072))
    expect(parsed).toEqual({
      tournamentKey: '1928',
      round: 'QF',
      playerKeyLo: '2072',
      playerKeyHi: '2382',
    })
  })
})

describe('parseMatchKey', () => {
  it('returns null when the shape is wrong', () => {
    expect(parseMatchKey('')).toBeNull()
    expect(parseMatchKey('1928_QF')).toBeNull()
    expect(parseMatchKey('1928_QF_2072')).toBeNull()
    expect(parseMatchKey('1928_QF_2072_2382_extra')).toBeNull()
  })
})

/* ---------------------------------------------------------- confidence tiers */

describe('getConfidenceTier', () => {
  it('names each band at its boundary', () => {
    expect(getConfidenceTier(85)).toBe('STRONG')
    expect(getConfidenceTier(75)).toBe('CONFIDENT')
    expect(getConfidenceTier(65)).toBe('PICK')
    expect(getConfidenceTier(55)).toBe('LEAN')
    expect(getConfidenceTier(54.9)).toBe('SKIP')
  })

  it('drops a tier just below each boundary', () => {
    expect(getConfidenceTier(84.9)).toBe('CONFIDENT')
    expect(getConfidenceTier(74.9)).toBe('PICK')
    expect(getConfidenceTier(64.9)).toBe('LEAN')
  })

  it('handles the extremes', () => {
    expect(getConfidenceTier(100)).toBe('STRONG')
    expect(getConfidenceTier(0)).toBe('SKIP')
  })

  it('has an emoji for every tier it can return', () => {
    for (const pct of [100, 85, 80, 70, 60, 50, 0]) {
      expect(TIER_EMOJI[getConfidenceTier(pct)]).toBeDefined()
    }
  })
})

/* -------------------------------------------------------------- tour detect */

describe('detectTour', () => {
  it('reads the tour out of the event type', () => {
    expect(detectTour('ATP Singles')).toBe('ATP')
    expect(detectTour('WTA Doubles')).toBe('WTA')
    expect(detectTour('ATP Challenger Men Singles')).toBe('ATP')
    expect(detectTour('Challenger Men Singles')).toBe('CHALLENGER')
    expect(detectTour('ITF Men Singles')).toBe('ITF')
  })

  it('is case-insensitive', () => {
    expect(detectTour('atp singles')).toBe('ATP')
    expect(detectTour('WTA SINGLES')).toBe('WTA')
  })

  it('returns null when there is nothing to read', () => {
    expect(detectTour(null)).toBeNull()
    expect(detectTour(undefined)).toBeNull()
    expect(detectTour('')).toBeNull()
    expect(detectTour('Exhibition')).toBeNull()
  })
})

/* ---------------------------------------------------------------- dates */

describe('date helpers', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-03-15T18:30:00Z'))).toBe('2026-03-15')
    expect(formatDate(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01')
  })

  it('returns a seven-day window starting today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
    expect(getTournamentDateRange()).toEqual({ start: '2026-03-15', end: '2026-03-22' })
  })

  it('rolls over month and year boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-28T12:00:00Z'))
    expect(getTournamentDateRange()).toEqual({ start: '2026-12-28', end: '2027-01-04' })
  })
})
