import { describe, it, expect } from 'vitest'
import { isTournamentAccessible, type TierAccess } from '../src/context/AuthContext'
import { levelToCategory } from '../netlify/functions/db'

const tier = (allTournaments: boolean): TierAccess => ({
  allTournaments,
  firstSetWinner: false,
  firstSetScore: false,
  overUnder: false,
  divergence: false,
  disruption: false,
  earlyAccess: false,
  parlay: false,
})

const FULL = tier(true)
const BASELINE = tier(false)

/* ------------------------------------------------------------ tier gating */

describe('isTournamentAccessible', () => {
  it('lets a full-access tier into anything', () => {
    for (const category of ['Grand Slam', 'ATP 250', 'WTA International', 'Challenger']) {
      expect(isTournamentAccessible(category, FULL)).toBe(true)
    }
  })

  it('lets Baseline into the events it is sold on', () => {
    // SubscriptionModal advertises Baseline as "Grand Slams + Masters only"
    expect(isTournamentAccessible('Grand Slam', BASELINE)).toBe(true)
    expect(isTournamentAccessible('ATP 1000', BASELINE)).toBe(true)
    expect(isTournamentAccessible('WTA 1000', BASELINE)).toBe(true)
    expect(isTournamentAccessible('ATP Finals', BASELINE)).toBe(true)
    expect(isTournamentAccessible('WTA Finals', BASELINE)).toBe(true)
  })

  it('keeps Baseline out of everything else', () => {
    for (const category of [
      'ATP 500', 'ATP 250', 'WTA 500', 'WTA 250',
      'WTA Premier', 'WTA International', 'Challenger', 'ITF',
    ]) {
      expect(isTournamentAccessible(category, BASELINE)).toBe(false)
    }
  })

  it('matches categories case-insensitively', () => {
    expect(isTournamentAccessible('grand slam', BASELINE)).toBe(true)
    expect(isTournamentAccessible('GRAND SLAM', BASELINE)).toBe(true)
    expect(isTournamentAccessible('atp 1000', BASELINE)).toBe(true)
  })

  it('denies an empty or unknown category for Baseline', () => {
    expect(isTournamentAccessible('', BASELINE)).toBe(false)
    expect(isTournamentAccessible('Exhibition', BASELINE)).toBe(false)
  })

  it('does not let a 1000-level string sneak past via a longer name', () => {
    // guards the substring match: these legitimately contain an allowed name
    expect(isTournamentAccessible('ATP 1000 Masters', BASELINE)).toBe(true)
    // but an unrelated event must stay out
    expect(isTournamentAccessible('ATP 100', BASELINE)).toBe(false)
  })
})

/* ------------------------------------------------- level to category names */

describe('levelToCategory', () => {
  it('maps the shared levels', () => {
    expect(levelToCategory('G', 'ATP')).toBe('Grand Slam')
    expect(levelToCategory('G', 'WTA')).toBe('Grand Slam')
  })

  it('splits tour-specific levels by tour', () => {
    expect(levelToCategory('M', 'ATP')).toBe('ATP 1000')
    expect(levelToCategory('M', 'WTA')).toBe('WTA 1000')
    expect(levelToCategory('A', 'ATP')).toBe('ATP 500')
    expect(levelToCategory('A', 'WTA')).toBe('WTA 500')
    expect(levelToCategory('B', 'ATP')).toBe('ATP 250')
    expect(levelToCategory('B', 'WTA')).toBe('WTA 250')
    expect(levelToCategory('F', 'ATP')).toBe('ATP Finals')
    expect(levelToCategory('F', 'WTA')).toBe('WTA Finals')
  })

  it('maps the WTA-only legacy levels', () => {
    expect(levelToCategory('P', 'WTA')).toBe('WTA Premier')
    expect(levelToCategory('PM', 'WTA')).toBe('WTA Premier Mandatory')
    expect(levelToCategory('PS', 'WTA')).toBe('WTA Premier 5')
    expect(levelToCategory('I', 'WTA')).toBe('WTA International')
  })

  it('falls back to the bare tour for anything unrecognised', () => {
    expect(levelToCategory('Z', 'ATP')).toBe('ATP')
    expect(levelToCategory('Z', 'WTA')).toBe('WTA')
    expect(levelToCategory('', 'ATP')).toBe('ATP')
  })

  it('produces categories Baseline gating can actually read', () => {
    // the two layers have to agree, or the paywall silently lets everyone in
    expect(isTournamentAccessible(levelToCategory('G', 'ATP'), BASELINE)).toBe(true)
    expect(isTournamentAccessible(levelToCategory('M', 'ATP'), BASELINE)).toBe(true)
    expect(isTournamentAccessible(levelToCategory('M', 'WTA'), BASELINE)).toBe(true)
    expect(isTournamentAccessible(levelToCategory('B', 'ATP'), BASELINE)).toBe(false)
    expect(isTournamentAccessible(levelToCategory('A', 'WTA'), BASELINE)).toBe(false)
  })
})
