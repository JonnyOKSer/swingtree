import { describe, it, expect } from 'vitest'
import {
  normalizeName,
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
