import { describe, it, expect, beforeEach, vi } from 'vitest'

const query = vi.fn()
vi.mock('../netlify/functions/db.js', () => ({ getPool: () => ({ query }) }))

const SECRET = 'test-secret-do-not-use-in-production'

/** Every admin endpoint, with the method it expects. */
const ENDPOINTS = [
  { name: 'admin-users', method: 'GET' },
  { name: 'admin-set-tier', method: 'POST' },
  { name: 'admin-extend-trial', method: 'POST' },
  { name: 'admin-generate-code', method: 'POST' },
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any

beforeEach(async () => {
  vi.resetModules()
  query.mockReset()
  query.mockResolvedValue({ rows: [], rowCount: 0 })
  process.env.JWT_SECRET = SECRET
  auth = await import('../netlify/functions/auth-utils')
})

const token = (isAdmin: boolean) =>
  auth.createSessionToken({
    userId: 42,
    email: 'player@example.com',
    name: 'Test Player',
    tier: 'baseline',
    status: 'active',
    trialEnd: null,
    isAdmin,
  })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (name: string): Promise<any> =>
  (await import(`../netlify/functions/${name}`)).handler

const req = (method: string, cookie?: string) => ({
  httpMethod: method,
  headers: cookie ? { cookie } : {},
  body: JSON.stringify({ userId: 1, tier: 'baseline', days: 7 }),
})

describe.each(ENDPOINTS)('$name authorisation', ({ name, method }) => {
  it('refuses an anonymous request', async () => {
    const handler = await load(name)
    expect((await handler(req(method), {})).statusCode).toBe(403)
  })

  it('refuses a signed-in non-admin', async () => {
    const handler = await load(name)
    const res = await handler(req(method, `ashe-session=${token(false)}`), {})
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toMatch(/admin/i)
  })

  it('refuses a token forged with the wrong secret', async () => {
    process.env.JWT_SECRET = 'attacker-secret'
    vi.resetModules()
    const forger = await import('../netlify/functions/auth-utils')
    const forged = forger.createSessionToken({
      userId: 1, email: 'a@b.c', name: null, tier: 'tree_top',
      status: 'active', trialEnd: null, isAdmin: true,
    })
    process.env.JWT_SECRET = SECRET
    vi.resetModules()
    const handler = await load(name)
    expect((await handler(req(method, `ashe-session=${forged}`), {})).statusCode).toBe(403)
  })

  it('refuses a tampered isAdmin claim', async () => {
    const handler = await load(name)
    const [header, , signature] = token(false).split('.')
    const payload = Buffer.from(JSON.stringify({
      userId: 42, email: 'player@example.com', name: null,
      tier: 'baseline', status: 'active', trialEnd: null, isAdmin: true,
    })).toString('base64url')
    const res = await handler(req(method, `ashe-session=${header}.${payload}.${signature}`), {})
    expect(res.statusCode).toBe(403)
  })

  it('touches no data when authorisation fails', async () => {
    const handler = await load(name)
    await handler(req(method), {})
    await handler(req(method, `ashe-session=${token(false)}`), {})
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects the wrong HTTP method even for an admin', async () => {
    const handler = await load(name)
    const wrong = method === 'GET' ? 'POST' : 'GET'
    const res = await handler(req(wrong, `ashe-session=${token(true)}`), {})
    expect(res.statusCode).toBe(405)
  })

  it('lets a real admin past the authorisation gate', async () => {
    const handler = await load(name)
    const res = await handler(req(method, `ashe-session=${token(true)}`), {})
    expect(res.statusCode).not.toBe(403)
  })
})

describe('admin privilege is read from the token, not the database', () => {
  it('keeps admin rights until the token expires, even after demotion', async () => {
    // Documents current behaviour rather than endorsing it: these endpoints
    // trust session.isAdmin from the JWT and never re-check the users table,
    // so a demoted admin keeps access for the lifetime of their token (24h).
    const handler = await load('admin-users')
    query.mockResolvedValue({ rows: [{ id: 42, is_admin: false }] })
    const res = await handler(req('GET', `ashe-session=${token(true)}`), {})
    expect(res.statusCode).not.toBe(403)
  })
})
