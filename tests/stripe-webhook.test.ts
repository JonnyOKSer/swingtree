import { describe, it, expect, beforeEach, vi } from 'vitest'
import Stripe from 'stripe'

// The handler reaches for a real connection pool; give it a fake one so the
// tests exercise the webhook logic rather than Postgres.
const query = vi.fn()
vi.mock('../netlify/functions/db.js', () => ({
  getPool: () => ({ query }),
}))

const WEBHOOK_SECRET = 'whsec_test_secret'
const PRICE_BASELINE = 'price_baseline_test'

const stripe = new Stripe('sk_test_dummy', { apiVersion: '2025-02-24.acacia' })

/** A request carrying a signature Stripe will actually accept. */
function signedRequest(body: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(body)
  return {
    httpMethod: 'POST',
    headers: {
      'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }),
    },
    body: payload,
  }
}

const checkoutCompleted = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      client_reference_id: '42',
      metadata: { userId: '42' },
      ...over,
    },
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: any

beforeEach(async () => {
  vi.resetModules()
  query.mockReset()
  query.mockResolvedValue({ rows: [], rowCount: 0 })
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.STRIPE_PRICE_BASELINE = PRICE_BASELINE
  ;({ handler } = await import('../netlify/functions/stripe-webhook'))
})

describe('stripe webhook: method and configuration', () => {
  it('only accepts POST', async () => {
    for (const httpMethod of ['GET', 'PUT', 'DELETE']) {
      const res = await handler({ httpMethod, headers: {}, body: '' }, {})
      expect(res.statusCode).toBe(405)
    }
  })

  it('refuses to run unconfigured rather than trusting the request', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    vi.resetModules()
    const mod = await import('../netlify/functions/stripe-webhook')
    const res = await mod.handler(signedRequest(checkoutCompleted()), {})
    expect(res.statusCode).toBe(500)
  })
})

describe('stripe webhook: signature verification', () => {
  it('rejects a request with no signature header', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: '{}' }, {})
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatch(/signature/i)
  })

  it('rejects a forged signature', async () => {
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      body: JSON.stringify(checkoutCompleted()),
    }, {})
    expect(res.statusCode).toBe(400)
  })

  it('rejects a signature made with the wrong secret', async () => {
    const res = await handler(signedRequest(checkoutCompleted(), 'whsec_attacker'), {})
    expect(res.statusCode).toBe(400)
  })

  it('rejects a body altered after signing', async () => {
    const req = signedRequest(checkoutCompleted())
    req.body = JSON.stringify(checkoutCompleted({ metadata: { userId: '999' } }))
    const res = await handler(req, {})
    expect(res.statusCode).toBe(400)
  })

  it('never touches the database when the signature fails', async () => {
    await handler(signedRequest(checkoutCompleted(), 'whsec_attacker'), {})
    expect(query).not.toHaveBeenCalled()
  })

  it('accepts a correctly signed event', async () => {
    const res = await handler(signedRequest(checkoutCompleted()), {})
    expect(res.statusCode).toBe(200)
  })
})

describe('stripe webhook: event handling', () => {
  it('acknowledges an event type it does not handle', async () => {
    const res = await handler(signedRequest({
      id: 'evt_x',
      type: 'customer.created',
      data: { object: { id: 'cus_1' } },
    }), {})
    // acknowledging stops Stripe retrying an event we will never act on
    expect(res.statusCode).toBe(200)
  })

  it('processes a cancellation', async () => {
    const res = await handler(signedRequest({
      id: 'evt_2',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    }), {})
    expect(res.statusCode).toBe(200)
    expect(query).toHaveBeenCalled()
  })

  it('processes a failed payment', async () => {
    const res = await handler(signedRequest({
      id: 'evt_3',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1' } },
    }), {})
    expect(res.statusCode).toBe(200)
  })

  it('processes a subscription update', async () => {
    const res = await handler(signedRequest({
      id: 'evt_4',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          items: { data: [{ price: { id: PRICE_BASELINE } }] },
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
        },
      },
    }), {})
    expect(res.statusCode).toBe(200)
  })
})
