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

/** The tournament lookup is the first query the handler makes. */
function tournament(category: string, name = 'Test Open') {
  query.mockReset()
  query.mockResolvedValueOnce({
    rows: [{
      tournament_id: 1, slug: 'test-open', name, country: 'USA', country_code: 'USA',
      city: 'Testville', surface: 'Hard', tourney_level: 'M', category, tour: 'ATP', draw_size: 32,
    }],
  })
  query.mockResolvedValue({ rows: [] })
}

beforeEach(async () => {
  vi.resetModules()
  process.env.JWT_SECRET = SECRET
  auth = await import('../netlify/functions/auth-utils')
  ;({ handler } = await import('../netlify/functions/draw'))
  tournament('ATP 500')
})

const cookieFor = (tier: string, status = 'active', trialEnd: string | null = null) =>
  `ashe-session=${auth.createSessionToken({
    userId: 42, email: 'player@example.com', name: 'Test Player',
    tier, status, trialEnd, isAdmin: false,
  })}`

const req = (cookie?: string, slug = 'test-open') => ({
  httpMethod: 'GET',
  path: `/api/draw/${slug}`,
  headers: cookie ? { cookie } : {},
  queryStringParameters: {},
})

describe('draw access: authentication', () => {
  it('turns away an anonymous request', async () => {
    const res = await handler(req(), {})
    expect(res.statusCode).toBe(401)
  })

  it('turns away a forged session', async () => {
    const res = await handler(req('ashe-session=forged'), {})
    expect(res.statusCode).toBe(401)
  })

  it('reads no data for an unauthenticated caller', async () => {
    await handler(req(), {})
    expect(query).not.toHaveBeenCalled()
  })

  it('still answers CORS preflight without a session', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {}, path: '/api/draw/x' }, {})
    expect(res.statusCode).toBe(200)
  })
})

describe('draw access: Baseline is limited to Slams and Masters', () => {
  it.each([
    ['Grand Slam'],
    ['ATP 1000'],
    ['WTA 1000'],
    ['ATP Finals'],
    ['WTA Finals'],
  ])('lets Baseline open %s', async (category) => {
    tournament(category)
    const res = await handler(req(cookieFor('baseline')), {})
    expect(res.statusCode).not.toBe(403)
  })

  it.each([
    ['ATP 500'],
    ['ATP 250'],
    ['WTA 500'],
    ['WTA International'],
    ['ATP'],
    ['WTA'],
  ])('keeps Baseline out of %s', async (category) => {
    tournament(category)
    const res = await handler(req(cookieFor('baseline')), {})
    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.reason).toBe('tier_restricted')
    expect(body.category).toBe(category)
  })

  it('names the tournament it is refusing, so the UI can say so', async () => {
    tournament('ATP 250', 'Barcelona')
    const body = JSON.parse((await handler(req(cookieFor('baseline')), {})).body)
    expect(body.tournament).toBe('Barcelona')
    expect(body.message).toMatch(/upgrade/i)
  })

  it('returns no draw data at all when it refuses', async () => {
    tournament('ATP 250')
    const body = JSON.parse((await handler(req(cookieFor('baseline')), {})).body)
    expect(body.rounds).toBeUndefined()
    expect(body.success).toBe(false)
  })
})

describe('draw access: the other tiers', () => {
  it.each([['trial'], ['all_court'], ['tree_top']])('lets %s open a 250-level event', async (tier) => {
    tournament('ATP 250')
    const res = await handler(req(cookieFor(tier)), {})
    expect(res.statusCode).not.toBe(403)
  })

  it('refuses an expired trial even though its tier still says trial', async () => {
    tournament('ATP 250')
    const res = await handler(req(cookieFor('trial', 'trial', '2020-01-01T00:00:00Z')), {})
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).reason).toBe('trial_expired')
  })

  it('still lets a running trial through', async () => {
    tournament('ATP 250')
    const res = await handler(req(cookieFor('trial', 'trial', '2999-01-01T00:00:00Z')), {})
    expect(res.statusCode).not.toBe(403)
  })

  it('refuses an unknown tier rather than defaulting open', async () => {
    tournament('ATP 250')
    const res = await handler(req(cookieFor('mystery_tier')), {})
    expect(res.statusCode).toBe(403)
  })
})

describe('draw access: category fallback', () => {
  it('derives a category from tourney_level when the column is empty', async () => {
    query.mockReset()
    query.mockResolvedValueOnce({
      rows: [{
        tournament_id: 1, slug: 'x', name: 'X', tourney_level: 'G',
        category: null, tour: 'ATP', draw_size: 128,
      }],
    })
    query.mockResolvedValue({ rows: [] })
    // level G is a Grand Slam, which Baseline may open
    expect((await handler(req(cookieFor('baseline')), {})).statusCode).not.toBe(403)
  })

  it('closes an unknown tournament to Baseline rather than opening it', async () => {
    query.mockReset()
    query.mockResolvedValue({ rows: [] })   // no tournament row at all
    const res = await handler(req(cookieFor('baseline'), 'unheard-of'), {})
    expect(res.statusCode).toBe(403)
  })
})

/* ------------------------------------------------------------- the side door */

describe('drawsheet is not a way around the paywall', () => {
  it('requires a session, like /api/draw', async () => {
    vi.resetModules()
    process.env.JWT_SECRET = SECRET
    const { handler: drawsheet } = await import('../netlify/functions/drawsheet')
    const res = await drawsheet({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { tournament_name: 'miami', tour: 'atp' },
    }, {})
    expect(res.statusCode).toBe(401)
  })

  it('reads no data for an anonymous caller', async () => {
    vi.resetModules()
    process.env.JWT_SECRET = SECRET
    query.mockReset()
    const { handler: drawsheet } = await import('../netlify/functions/drawsheet')
    await drawsheet({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { tournament_name: 'miami' },
    }, {})
    expect(query).not.toHaveBeenCalled()
  })
})
