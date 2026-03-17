import { describe, it, expect } from 'vitest'

// Pure functions extracted from tournaments.ts for testing
// These are duplicated here to test the logic in isolation

function normalizeName(name: string): string {
  return name
    .replace(/ Masters$/i, '')
    .replace(/ Open$/i, '')
    .replace(/ Championships$/i, '')
    .trim()
}

function getDisplayName(name: string): string {
  const normalized = normalizeName(name).toLowerCase()
  if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) return 'Indian Wells'
  if (normalized.includes('miami')) return 'Miami Open'
  if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) return 'Monte-Carlo Masters'
  if (normalized.includes('roland garros') || normalized.includes('french')) return 'Roland Garros'
  return normalizeName(name)
}

function getCanonicalKey(name: string, tour: string = 'ATP'): string {
  const normalized = normalizeName(name).toLowerCase()
  let base = normalized
  if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) base = 'indian-wells'
  else if (normalized.includes('miami')) base = 'miami'
  else if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) base = 'monte-carlo'
  else if (normalized.includes('roland garros') || normalized.includes('french')) base = 'roland-garros'
  else base = normalized.replace(/[^a-z0-9]/g, '-')
  return `${base}-${tour.toLowerCase()}`
}

const ROUND_DISPLAY: Record<string, string> = {
  'F': 'Final',
  'SF': 'Semifinals',
  'QF': 'Quarterfinals',
  'R16': 'Round of 16',
  'R32': 'Round of 32',
  'R64': 'Round of 64',
  'R128': 'Round of 128'
}

interface TournamentStatus {
  status: 'active' | 'upcoming' | 'completed'
  displayRound: string
}

function determineTournamentStatus(
  latestRound: string | null,
  latestCompleted: boolean,
  todayPending: number,
  lastPredDate: Date,
  today: Date
): TournamentStatus {
  let status: 'active' | 'upcoming' | 'completed' = 'active'
  let displayRound = latestRound ? ROUND_DISPLAY[latestRound] || latestRound : 'Round of 64'

  // Note: 'QF' is Quarterfinals, not Qualifying - only match exact 'Q' or 'Q1', 'Q2', 'Q3'
  const isQualifying = latestRound === 'Q' || /^Q\d*$/.test(latestRound || '')

  if (latestRound === 'F' && latestCompleted) {
    status = 'completed'
    displayRound = 'Final'
  } else if (isQualifying) {
    status = 'active'
    displayRound = 'Qualifying'
  } else if (todayPending === 0 && latestCompleted && !isQualifying) {
    const daysSince = Math.floor((today.getTime() - lastPredDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince >= 1) {
      status = 'completed'
    }
  }

  return { status, displayRound }
}

describe('Tournament Name Normalization', () => {
  it('normalizes Indian Wells variations', () => {
    expect(getDisplayName('Indian Wells Masters')).toBe('Indian Wells')
    expect(getDisplayName('Indian Wells')).toBe('Indian Wells')
    expect(getDisplayName('BNP Paribas Open')).toBe('Indian Wells')
  })

  it('normalizes Miami variations', () => {
    expect(getDisplayName('Miami Open')).toBe('Miami Open')
    expect(getDisplayName('Miami Masters')).toBe('Miami Open')
  })

  it('creates separate canonical keys for ATP and WTA', () => {
    expect(getCanonicalKey('Indian Wells', 'ATP')).toBe('indian-wells-atp')
    expect(getCanonicalKey('Indian Wells', 'WTA')).toBe('indian-wells-wta')
    expect(getCanonicalKey('BNP Paribas Open', 'WTA')).toBe('indian-wells-wta')
    expect(getCanonicalKey('Miami Open', 'ATP')).toBe('miami-atp')
    expect(getCanonicalKey('Miami Open', 'WTA')).toBe('miami-wta')
  })

  it('does not combine ATP and WTA tournaments', () => {
    const atpKey = getCanonicalKey('Indian Wells', 'ATP')
    const wtaKey = getCanonicalKey('Indian Wells', 'WTA')
    expect(atpKey).not.toBe(wtaKey)
  })
})

describe('Tournament Status Determination', () => {
  const today = new Date('2026-03-17')

  it('marks completed Final as completed', () => {
    const result = determineTournamentStatus('F', true, 0, new Date('2026-03-15'), today)
    expect(result.status).toBe('completed')
    expect(result.displayRound).toBe('Final')
  })

  it('marks active tournament with pending predictions as active', () => {
    const result = determineTournamentStatus('R32', false, 5, new Date('2026-03-17'), today)
    expect(result.status).toBe('active')
    expect(result.displayRound).toBe('Round of 32')
  })

  it('marks qualifying round as active, not completed', () => {
    const result = determineTournamentStatus('Q', true, 0, new Date('2026-03-16'), today)
    expect(result.status).toBe('active')
    expect(result.displayRound).toBe('Qualifying')
  })

  it('does not mark qualifying tournament as completed even if no pending', () => {
    // Miami scenario: qualifying is done, no main draw predictions yet
    const result = determineTournamentStatus('Q', true, 0, new Date('2026-03-16'), today)
    expect(result.status).not.toBe('completed')
    expect(result.status).toBe('active')
  })

  it('marks non-qualifying tournament as completed after 1+ days with no pending', () => {
    const result = determineTournamentStatus('QF', true, 0, new Date('2026-03-15'), today)
    expect(result.status).toBe('completed')
  })

  it('keeps same-day completed tournament as active', () => {
    const result = determineTournamentStatus('SF', true, 0, new Date('2026-03-17'), today)
    expect(result.status).toBe('active')
  })
})

describe('Round Display Mapping', () => {
  it('maps round codes to display names', () => {
    expect(ROUND_DISPLAY['F']).toBe('Final')
    expect(ROUND_DISPLAY['SF']).toBe('Semifinals')
    expect(ROUND_DISPLAY['QF']).toBe('Quarterfinals')
    expect(ROUND_DISPLAY['R16']).toBe('Round of 16')
    expect(ROUND_DISPLAY['R32']).toBe('Round of 32')
  })
})
