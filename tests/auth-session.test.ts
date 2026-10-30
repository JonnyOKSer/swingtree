import { describe, it, expect, beforeEach, vi } from 'vitest'

const query = vi.fn()
vi.mock('../netlify/functions/db.js', () => ({
  getPool: () => ({ query }),
}))

const SECRET = 'test-secret-do-not-use-in-production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: 42,
  email: 'player@example.com',
  name: 'Test Player',
  avatar_url: null,
  subscription_tier: 'baseline',
  subscription_status: 'active',
  trial_end: null,
  is_admin: false,
  comp_tier: null,
  alerts_enabled: true,
  ...over,
})

const get = (cookie?: string) => ({
  httpMethod: 'GET',
  headers: cookie ? { cookie } : {},
})

beforeEach(async () => {
  vi.resetModules()
  query.mockReset()
  process.env.JWT_SECRET = SECRET
  auth = await import('../netlify/functions/auth-utils')
  ;({ handler } = await import('../netlify/functions/auth-session'))
})

const signedCookie = (over = {}) =>
  `ashe-session=${auth.createSessionToken({
    userId: 42,
    email: 'player@example.com',
    name: 'Test Player',
    tier: 'baseline',
    status: 'active',
    trialEnd: null,
    isAdmin: false,
    ...over,
  })}`

describe('auth-session: who gets in', () => {
  it('only answers GET', async () => {
    for (const httpMethod of ['POST', 'PUT', 'DELETE']) {
      const res = await handler({ httpMethod, headers: {} }, {})
      expect(res.statusCode).toBe(405)
    }
  })

  it('refuses a request with no cookie', async () => {
    const res = await handler(get(), {})
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toMatch(/not authenticated/i)
  })

  it('refuses a garbage token', async () => {
    const res = await handler(get('ashe-session=nonsense'), {})
    expect(res.statusCode).toBe(401)
  })

  it('refuses a token signed by somebody else', async () => {
    process.env.JWT_SECRET = 'attacker-secret'
    vi.resetModules()
    const forger = await import('../netlify/functions/auth-utils')
    const forged = forger.createSessionToken({
      userId: 1, email: 'a@b.c', name: null, tier: 'tree_top',
      status: 'active', trialEnd: null, isAdmin: true,
    })
    process.env.JWT_SECRET = SECRET
    vi.resetModules()
    const mod = await import('../netlify/functions/auth-session')
    const res = await mod.handler(get(`ashe-session=${forged}`), {})
    expect(res.statusCode).toBe(401)
  })

  it('never queries the database for an unauthenticated request', async () => {
    await handler(get(), {})
    await handler(get('ashe-session=nonsense'), {})
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses a valid token whose user no longer exists', async () => {
    query.mockResolvedValue({ rows: [] })
    const res = await handler(get(signedCookie()), {})
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toMatch(/not found/i)
  })
})

describe('auth-session: what it returns', () => {
  it('returns the user for a valid session', async () => {
    query.mockResolvedValue({ rows: [dbUser()] })
    const res = await handler(get(signedCookie()), {})
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).user).toMatchObject({
      id: 42,
      email: 'player@example.com',
      tier: 'baseline',
      status: 'active',
      isAdmin: false,
      alertsEnabled: true,
    })
  })

  it('looks the user up by the id in the token, not anything from the request', async () => {
    query.mockResolvedValue({ rows: [dbUser()] })
    await handler(get(signedCookie()), {})
    expect(query).toHaveBeenCalledWith(expect.any(String), [42])
  })

  it('trusts the database over the token for tier and admin', async () => {
    // a token minted before a downgrade must not keep its old powers
    query.mockResolvedValue({ rows: [dbUser({ subscription_tier: 'baseline', is_admin: false })] })
    const res = await handler(get(signedCookie({ tier: 'tree_top', isAdmin: true })), {})
    const { user } = JSON.parse(res.body)
    expect(user.tier).toBe('baseline')
    expect(user.isAdmin).toBe(false)
  })

  it('reports an expired trial as expired', async () => {
    query.mockResolvedValue({
      rows: [dbUser({
        subscription_tier: 'trial',
        subscription_status: 'trial',
        trial_end: new Date('2020-01-01T00:00:00Z'),
      })],
    })
    const res = await handler(get(signedCookie()), {})
    expect(JSON.parse(res.body).user.status).toBe('expired')
  })

  it('leaves a trial that is still running alone', async () => {
    query.mockResolvedValue({
      rows: [dbUser({
        subscription_tier: 'trial',
        subscription_status: 'trial',
        trial_end: new Date('2999-01-01T00:00:00Z'),
      })],
    })
    expect(JSON.parse((await handler(get(signedCookie()), {})).body).user.status).toBe('trial')
  })

  it('serialises trialEnd as an ISO string or null', async () => {
    query.mockResolvedValue({ rows: [dbUser({ trial_end: new Date('2026-06-01T00:00:00Z') })] })
    expect(JSON.parse((await handler(get(signedCookie()), {})).body).user.trialEnd)
      .toBe('2026-06-01T00:00:00.000Z')

    query.mockResolvedValue({ rows: [dbUser({ trial_end: null })] })
    expect(JSON.parse((await handler(get(signedCookie()), {})).body).user.trialEnd).toBeNull()
  })

  it('does not leak internal columns to the client', async () => {
    query.mockResolvedValue({ rows: [dbUser({ comp_tier: 'secret', avatar_url: 'x' })] })
    const { user } = JSON.parse((await handler(get(signedCookie()), {})).body)
    expect(user).not.toHaveProperty('comp_tier')
    expect(user).not.toHaveProperty('subscription_tier')
    expect(user).not.toHaveProperty('avatar_url')
  })

  it('answers 500, not a stack trace, when the database fails', async () => {
    query.mockRejectedValue(new Error('connection refused'))
    const res = await handler(get(signedCookie()), {})
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('connection refused')
  })
})
