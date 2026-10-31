import { describe, it, expect, beforeEach, vi } from 'vitest'

const query = vi.fn()
vi.mock('../netlify/functions/db', async (orig) => {
  const actual = await orig<typeof import('../netlify/functions/db')>()
  return { ...actual, getPool: () => ({ query }) }
})

const SECRET = 'test-secret-do-not-use-in-production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any

/**
 * The four queries the handler issues, in order: tiers, overall, first set,
 * date range. Shaped from the real production figures on 2026-10-31.
 */
function production() {
  query.mockReset()
  query.mockResolvedValueOnce({ rows: [
    { tier: 'SKIP', tour: 'ATP', total: '1489', correct: '852' },
    { tier: 'SKIP', tour: 'WTA', total: '2093', correct: '1191' },
    { tier: 'LEAN', tour: 'ATP', total: '589', correct: '385' },
    { tier: 'LEAN', tour: 'WTA', total: '916', correct: '595' },
    { tier: 'PICK', tour: 'ATP', total: '386', correct: '252' },
    { tier: 'PICK', tour: 'WTA', total: '189', correct: '152' },
    { tier: 'CONFIDENT', tour: 'ATP', total: '77', correct: '59' },
    { tier: 'STRONG', tour: 'ATP', total: '1', correct: '1' },
  ] })
  query.mockResolvedValueOnce({ rows: [{ total: '5740', correct: '3487' }] })
  query.mockResolvedValueOnce({ rows: [
    { winner_total: '1835', winner_correct: '1050', score_total: '1860', score_correct: '450' },
  ] })
  query.mockResolvedValueOnce({ rows: [
    { first: '2026-03-12T00:00:00Z', last: '2026-10-30T00:00:00Z' },
  ] })
}

beforeEach(async () => {
  vi.resetModules()
  process.env.JWT_SECRET = SECRET
  auth = await import('../netlify/functions/auth-utils')
  ;({ handler } = await import('../netlify/functions/pedigree-stats'))
  production()
})

const cookie = () => `ashe-session=${auth.createSessionToken({
  userId: 42, email: 'player@example.com', name: 'Test Player',
  tier: 'baseline', status: 'active', trialEnd: null, isAdmin: false,
})}`

const req = (headers: Record<string, string> = {}) => ({ httpMethod: 'GET', headers })

const body = async (res: { body: string }) => JSON.parse(res.body)

describe('pedigree-stats access', () => {
  it('refuses an anonymous caller', async () => {
    const res = await handler(req(), {})
    expect(res.statusCode).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('serves any signed-in user, not just admins', async () => {
    const res = await handler(req({ cookie: cookie() }), {})
    expect(res.statusCode).toBe(200)
    expect((await body(res)).success).toBe(true)
  })

  it('answers preflight without touching the database', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} }, {})
    expect(res.statusCode).toBe(200)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('what it reports', () => {
  it('computes accuracy from the log rather than a constant', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    const strong = data.byTier.find((r: { tier: string }) => r.tier === 'STRONG')
    const confident = data.byTier.find((r: { tier: string }) => r.tier === 'CONFIDENT')

    // The page used to claim 87.1% for ATP STRONG off one graded pick.
    expect(strong.total).toBe(1)
    expect(confident.accuracy).toBeCloseTo(76.6, 1)
  })

  it('marks a tier with too small a sample as unreliable', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    const strong = data.byTier.find((r: { tier: string }) => r.tier === 'STRONG')
    expect(strong.reliable).toBe(false)
    expect(data.minSample).toBe(30)
  })

  it('marks a tier with a real sample as reliable', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    for (const tier of ['SKIP', 'LEAN', 'PICK']) {
      expect(data.byTier.find((r: { tier: string }) => r.tier === tier).reliable).toBe(true)
    }
  })

  it('reports WTA STRONG as absent rather than inventing it', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    const wtaStrong = data.byTier.find(
      (r: { tier: string; tour: string }) => r.tier === 'STRONG' && r.tour === 'WTA'
    )
    expect(wtaStrong).toBeUndefined()
  })

  it('keeps the tours separate so one cannot be read as the other', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    const wtaPick = data.byTier.find(
      (r: { tier: string; tour: string }) => r.tier === 'PICK' && r.tour === 'WTA'
    )
    expect(wtaPick.accuracy).toBeCloseTo(80.4, 1)
  })

  it('reports the first-set exact-score rate with its sample', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    expect(data.firstSet.exactScore.accuracy).toBeCloseTo(24.2, 1)
    expect(data.firstSet.exactScore.total).toBe(1860)
  })

  it('reports the window the record covers', async () => {
    const data = await body(await handler(req({ cookie: cookie() }), {}))
    expect(data.range).toEqual({ first: '2026-03-12', last: '2026-10-30' })
  })

  it('excludes voided and ungraded predictions from every query', async () => {
    await handler(req({ cookie: cookie() }), {})
    for (const [sql] of query.mock.calls) {
      expect(sql).toMatch(/confidence_tier <> 'VOID'/)
      expect(sql).toMatch(/reconciled_at IS NOT NULL/)
      expect(sql).toMatch(/actual_winner IS NOT NULL/)
    }
  })
})

describe('when there is nothing to report', () => {
  it('returns nulls rather than dividing by zero', async () => {
    query.mockReset()
    query.mockResolvedValueOnce({ rows: [] })
    query.mockResolvedValueOnce({ rows: [{ total: '0', correct: '0' }] })
    query.mockResolvedValueOnce({ rows: [{ winner_total: '0', winner_correct: '0', score_total: '0', score_correct: '0' }] })
    query.mockResolvedValueOnce({ rows: [{ first: null, last: null }] })

    const data = await body(await handler(req({ cookie: cookie() }), {}))
    expect(data.byTier).toEqual([])
    expect(data.overall.accuracy).toBeNull()
    expect(data.firstSet.exactScore.accuracy).toBeNull()
    expect(data.range).toEqual({ first: null, last: null })
  })

  it('fails with a message instead of a stack trace', async () => {
    query.mockReset()
    query.mockRejectedValue(new Error('connection terminated'))
    const res = await handler(req({ cookie: cookie() }), {})
    expect(res.statusCode).toBe(500)
    const data = await body(res)
    expect(data.success).toBe(false)
    expect(data.error).not.toMatch(/connection terminated/)
  })
})
