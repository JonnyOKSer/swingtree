import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as jwt from 'jsonwebtoken'
import {
  createSessionToken,
  verifySessionToken,
  parseSessionFromCookies,
  parseOAuthState,
  parsePendingCode,
  createSessionCookie,
  createLogoutCookie,
  createStateCookie,
  clearStateCookie,
  createPendingCodeCookie,
  clearPendingCodeCookie,
  hashCode,
  verifyCode,
  generateAccessCode,
  generateStateToken,
  getBaseUrl,
  isTrialExpired,
  getEffectiveStatus,
  type SessionPayload,
} from '../netlify/functions/auth-utils'

const SECRET = 'test-secret-do-not-use-in-production'

const session = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  userId: 42,
  email: 'player@example.com',
  name: 'Test Player',
  tier: 'baseline',
  status: 'active',
  trialEnd: null,
  isAdmin: false,
  ...over,
})

beforeEach(() => {
  process.env.JWT_SECRET = SECRET
  delete process.env.CONTEXT
  delete process.env.NODE_ENV
  delete process.env.URL
})

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ tokens */

describe('session tokens', () => {
  it('round-trips a payload', () => {
    const decoded = verifySessionToken(createSessionToken(session()))
    expect(decoded).toMatchObject({
      userId: 42,
      email: 'player@example.com',
      tier: 'baseline',
      isAdmin: false,
    })
  })

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign(session({ isAdmin: true }), 'attacker-secret')
    expect(verifySessionToken(forged)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const [header, , signature] = createSessionToken(session()).split('.')
    const payload = Buffer.from(
      JSON.stringify({ ...session(), isAdmin: true }),
    ).toString('base64url')
    expect(verifySessionToken(`${header}.${payload}.${signature}`)).toBeNull()
  })

  it('rejects malformed and empty tokens rather than throwing', () => {
    expect(verifySessionToken('')).toBeNull()
    expect(verifySessionToken('not-a-jwt')).toBeNull()
    expect(verifySessionToken('a.b.c')).toBeNull()
  })

  it('rejects an expired token', () => {
    const expired = jwt.sign(session(), SECRET, { expiresIn: '-1s' })
    expect(verifySessionToken(expired)).toBeNull()
  })

  it('issues tokens that expire', () => {
    const decoded = jwt.decode(createSessionToken(session())) as jwt.JwtPayload
    expect(decoded.exp).toBeDefined()
    expect(decoded.exp! - decoded.iat!).toBe(60 * 60 * 24)
  })

  it('throws when no signing secret is configured', () => {
    delete process.env.JWT_SECRET
    expect(() => createSessionToken(session())).toThrow(/JWT_SECRET/)
  })

  it('does not verify a token once the secret rotates', () => {
    const token = createSessionToken(session())
    process.env.JWT_SECRET = 'rotated-secret'
    expect(verifySessionToken(token)).toBeNull()
  })
})

/* ----------------------------------------------------------------- cookies */

describe('reading cookies', () => {
  it('reads a session out of a cookie header', () => {
    const token = createSessionToken(session())
    const header = `ashe-session=${token}; other=value`
    expect(parseSessionFromCookies(header)?.userId).toBe(42)
  })

  it('returns null for a missing header, an unrelated cookie, or a bad token', () => {
    expect(parseSessionFromCookies(undefined)).toBeNull()
    expect(parseSessionFromCookies('other=value')).toBeNull()
    expect(parseSessionFromCookies('ashe-session=garbage')).toBeNull()
  })

  it('reads the OAuth state and pending code cookies', () => {
    expect(parseOAuthState('oauth-state=abc-123')).toBe('abc-123')
    expect(parseOAuthState('nothing=here')).toBeNull()
    expect(parseOAuthState(undefined)).toBeNull()

    const pending = parsePendingCode('pending-code=' + encodeURIComponent(JSON.stringify({ code: 'ASHE-AAAA-BBBB', tier: 'all_court' })))
    expect(JSON.parse(pending!)).toEqual({ code: 'ASHE-AAAA-BBBB', tier: 'all_court' })
    expect(parsePendingCode(undefined)).toBeNull()
  })
})

describe('writing cookies', () => {
  it('makes the session cookie httpOnly, lax and path-scoped', () => {
    const c = createSessionCookie('tok')
    expect(c).toContain('ashe-session=tok')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=86400')
  })

  it('only sets Secure in production', () => {
    expect(createSessionCookie('tok')).not.toContain('Secure')
    process.env.CONTEXT = 'production'
    expect(createSessionCookie('tok')).toContain('Secure')
  })

  it('expires the cookie on logout', () => {
    const c = createLogoutCookie()
    expect(c).toContain('ashe-session=')
    expect(c).toContain('Max-Age=0')
    expect(c).toContain('HttpOnly')
  })

  it('keeps the OAuth state cookie short-lived', () => {
    expect(createStateCookie('s')).toContain('Max-Age=300')
    expect(clearStateCookie()).toContain('Max-Age=0')
  })

  it('stores the pending code as JSON and can clear it', () => {
    const c = createPendingCodeCookie('ASHE-AAAA-BBBB', 'tree_top')
    expect(decodeURIComponent(c)).toContain('"code":"ASHE-AAAA-BBBB"')
    expect(decodeURIComponent(c)).toContain('"tier":"tree_top"')
    expect(c).toContain('Max-Age=600')
    expect(clearPendingCodeCookie()).toContain('Max-Age=0')
  })
})

/* ------------------------------------------------------------ access codes */

describe('access codes', () => {
  it('verifies a code against its hash', async () => {
    const hash = await hashCode('ASHE-AAAA-BBBB')
    expect(await verifyCode('ASHE-AAAA-BBBB', hash)).toBe(true)
    expect(await verifyCode('ASHE-CCCC-DDDD', hash)).toBe(false)
  })

  it('is case- and whitespace-insensitive, since users type these', async () => {
    const hash = await hashCode('ASHE-AAAA-BBBB')
    expect(await verifyCode('ashe-aaaa-bbbb', hash)).toBe(true)
    expect(await verifyCode('  ASHE-AAAA-BBBB  ', hash)).toBe(true)
  })

  it('never stores the code in the clear', async () => {
    const hash = await hashCode('ASHE-AAAA-BBBB')
    expect(hash).not.toContain('ASHE-AAAA-BBBB')
    expect(hash.startsWith('$2')).toBe(true)
  })

  it('salts, so the same code hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashCode('ASHE-AAAA-BBBB'), hashCode('ASHE-AAAA-BBBB')])
    expect(a).not.toBe(b)
    expect(await verifyCode('ASHE-AAAA-BBBB', a)).toBe(true)
    expect(await verifyCode('ASHE-AAAA-BBBB', b)).toBe(true)
  })

  it('generates codes in ASHE-XXXX-XXXX form', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateAccessCode()).toMatch(/^ASHE-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    }
  })

  it('omits characters that are easy to misread', () => {
    const generated = Array.from({ length: 200 }, generateAccessCode).join('')
    for (const confusing of ['0', 'O', 'I', '1']) {
      expect(generated.slice(5).includes(confusing)).toBe(false)
    }
  })

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, generateAccessCode))
    expect(codes.size).toBeGreaterThan(190)
  })

  it('generates distinct OAuth state tokens', () => {
    const states = new Set(Array.from({ length: 100 }, generateStateToken))
    expect(states.size).toBe(100)
    expect(generateStateToken()).toMatch(/^[0-9a-f-]{36}$/)
  })
})

/* --------------------------------------------------------------- base URL */

describe('getBaseUrl', () => {
  it('prefers the request host', () => {
    expect(getBaseUrl({ host: 'swingtree.ai' })).toBe('https://swingtree.ai')
    expect(getBaseUrl({ Host: 'swingtree.ai' })).toBe('https://swingtree.ai')
  })

  it('uses http only for localhost', () => {
    expect(getBaseUrl({ host: 'localhost:8888' })).toBe('http://localhost:8888')
  })

  it('falls back to the Netlify URL, then to localhost', () => {
    process.env.URL = 'https://deploy-preview.netlify.app'
    expect(getBaseUrl()).toBe('https://deploy-preview.netlify.app')
    delete process.env.URL
    expect(getBaseUrl()).toBe('http://localhost:8888')
    expect(getBaseUrl({})).toBe('http://localhost:8888')
  })
})

/* ---------------------------------------------------------- trial + status */

describe('isTrialExpired', () => {
  const past = '2020-01-01T00:00:00Z'
  const future = '2999-01-01T00:00:00Z'

  it('is false for comped and active accounts regardless of date', () => {
    expect(isTrialExpired(past, 'comp')).toBe(false)
    expect(isTrialExpired(past, 'active')).toBe(false)
  })

  it('is false when there is no trial end', () => {
    expect(isTrialExpired(null, 'trial')).toBe(false)
  })

  it('tracks the trial end date otherwise', () => {
    expect(isTrialExpired(past, 'trial')).toBe(true)
    expect(isTrialExpired(future, 'trial')).toBe(false)
  })

  it('treats the boundary as not yet expired', () => {
    vi.useFakeTimers()
    const now = new Date('2026-06-01T12:00:00Z')
    vi.setSystemTime(now)
    expect(isTrialExpired(now.toISOString(), 'trial')).toBe(false)
    vi.setSystemTime(new Date(now.getTime() + 1000))
    expect(isTrialExpired(now.toISOString(), 'trial')).toBe(true)
  })
})

describe('getEffectiveStatus', () => {
  it('passes through explicit account states', () => {
    expect(getEffectiveStatus('baseline', 'comp', null)).toBe('comp')
    expect(getEffectiveStatus('baseline', 'active', null)).toBe('active')
    expect(getEffectiveStatus('baseline', 'past_due', null)).toBe('past_due')
    expect(getEffectiveStatus('baseline', 'cancelled', null)).toBe('cancelled')
  })

  it('expires a trial once its end date passes', () => {
    expect(getEffectiveStatus('trial', 'trial', '2020-01-01T00:00:00Z')).toBe('expired')
    expect(getEffectiveStatus('trial', 'trial', '2999-01-01T00:00:00Z')).toBe('trial')
    expect(getEffectiveStatus('trial', 'trial', null)).toBe('trial')
  })

  it('does not expire a comped account that still carries a trial date', () => {
    expect(getEffectiveStatus('trial', 'comp', '2020-01-01T00:00:00Z')).toBe('comp')
  })
})
