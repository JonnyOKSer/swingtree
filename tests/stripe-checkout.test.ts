import { describe, it, expect, beforeEach, vi } from 'vitest'

const query = vi.fn()
vi.mock('../netlify/functions/db.js', () => ({ getPool: () => ({ query }) }))

const createSession = vi.fn()
const createCustomer = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: createSession } }
    customers = { create: createCustomer }
  },
}))

const SECRET = 'test-secret-do-not-use-in-production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any

const post = (body: unknown, cookie?: string) => ({
  httpMethod: 'POST',
  headers: cookie ? { cookie } : {},
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

const user = (over: Record<string, unknown> = {}) => ({
  id: 42,
  email: 'player@example.com',
  name: 'Test Player',
  stripe_customer_id: 'cus_existing',
  subscription_status: 'trial',
  subscription_tier: 'trial',
  ...over,
})

/** Cap row first, then the user row — the order the handler queries them in. */
function withDb({ cap = 1000, total = 1, rows = [user()] } = {}) {
  query.mockReset()
  query
    .mockResolvedValueOnce({ rows: [{ total_cap: cap, current_total: total }] })
    .mockResolvedValueOnce({ rows })
    .mockResolvedValue({ rows: [], rowCount: 0 })
}

beforeEach(async () => {
  vi.resetModules()
  createSession.mockReset()
  createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  createCustomer.mockReset()
  createCustomer.mockResolvedValue({ id: 'cus_new' })
  process.env.JWT_SECRET = SECRET
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_PRICE_BASELINE = 'price_baseline'
  process.env.STRIPE_PRICE_ALL_COURT = 'price_all_court'
  process.env.STRIPE_PRICE_TREE_TOP = 'price_tree_top'
  auth = await import('../netlify/functions/auth-utils')
  ;({ handler } = await import('../netlify/functions/stripe-checkout'))
  withDb()
})

const cookie = (over = {}) =>
  `ashe-session=${auth.createSessionToken({
    userId: 42, email: 'player@example.com', name: 'Test Player',
    tier: 'trial', status: 'trial', trialEnd: null, isAdmin: false, ...over,
  })}`

describe('stripe-checkout: method handling', () => {
  it('answers CORS preflight', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} }, {})
    expect(res.statusCode).toBe(200)
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST')
  })

  it('rejects anything other than POST', async () => {
    for (const httpMethod of ['GET', 'PUT', 'DELETE']) {
      expect((await handler({ httpMethod, headers: {} }, {})).statusCode).toBe(405)
    }
  })
})

describe('stripe-checkout: authentication', () => {
  it('refuses an anonymous request', async () => {
    const res = await handler(post({ tier: 'baseline' }), {})
    expect(res.statusCode).toBe(401)
  })

  it('refuses a forged session', async () => {
    const res = await handler(post({ tier: 'baseline' }, 'ashe-session=forged'), {})
    expect(res.statusCode).toBe(401)
  })

  it('creates no Stripe session for an unauthenticated caller', async () => {
    await handler(post({ tier: 'baseline' }), {})
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses when the session points at a user who is gone', async () => {
    withDb({ rows: [] })
    const res = await handler(post({ tier: 'baseline' }, cookie()), {})
    expect(res.statusCode).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })
})

describe('stripe-checkout: tier validation', () => {
  it('rejects an unknown tier', async () => {
    for (const tier of ['free', 'platinum', '', null, undefined]) {
      const res = await handler(post({ tier }, cookie()), {})
      expect(res.statusCode).toBe(400)
    }
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    const res = await handler(post('{not json', cookie()), {})
    expect(res.statusCode).toBe(400)
  })

  it('will not let a caller name their own price id', async () => {
    const res = await handler(post({ tier: 'baseline', priceId: 'price_free' }, cookie()), {})
    expect(res.statusCode).toBe(200)
    const args = createSession.mock.calls[0][0]
    expect(JSON.stringify(args)).toContain('price_baseline')
    expect(JSON.stringify(args)).not.toContain('price_free')
  })

  it('accepts each real tier and uses its configured price', async () => {
    for (const [tier, price] of [
      ['baseline', 'price_baseline'],
      ['all_court', 'price_all_court'],
      ['tree_top', 'price_tree_top'],
    ]) {
      withDb()
      createSession.mockClear()
      const res = await handler(post({ tier }, cookie()), {})
      expect(res.statusCode).toBe(200)
      expect(JSON.stringify(createSession.mock.calls[0][0])).toContain(price)
    }
  })
})

describe('stripe-checkout: caps and configuration', () => {
  it('turns people away once the member cap is reached', async () => {
    withDb({ cap: 100, total: 100 })
    const res = await handler(post({ tier: 'baseline' }, cookie()), {})
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toMatch(/spots filled/i)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('lets the last spot through', async () => {
    withDb({ cap: 100, total: 99 })
    expect((await handler(post({ tier: 'baseline' }, cookie()), {})).statusCode).toBe(200)
  })

  it('fails closed when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY
    vi.resetModules()
    const mod = await import('../netlify/functions/stripe-checkout')
    const res = await mod.handler(post({ tier: 'baseline' }, cookie()), {})
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toMatch(/sk_test/)
  })

  it('returns a checkout url on success', async () => {
    const res = await handler(post({ tier: 'baseline' }, cookie()), {})
    expect(JSON.parse(res.body).url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
  })
})
