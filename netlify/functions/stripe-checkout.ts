import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import Stripe from 'stripe'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Stripe Checkout Session
 *
 * Creates a Stripe Checkout Session for subscription signup.
 *
 * Endpoint: POST /api/stripe-checkout
 *
 * Body: { tier: 'baseline' | 'all_court' | 'tree_top' }
 *
 * Response:
 * - 200: { url: string } - Stripe Checkout URL
 * - 400: { error: string } - Invalid request
 * - 401: { error: string } - Not authenticated
 * - 403: { error: string } - Cap reached or comp user
 */

const PRICE_MAP: Record<string, string | undefined> = {
  baseline: process.env.STRIPE_PRICE_BASELINE,
  all_court: process.env.STRIPE_PRICE_ALL_COURT,
  tree_top: process.env.STRIPE_PRICE_TREE_TOP
}

const TIER_NAMES: Record<string, string> = {
  baseline: 'Baseline',
  all_court: 'All-Court',
  tree_top: 'Tree Top'
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Verify session
  const session = parseSessionFromCookies(event.headers.cookie)
  if (!session) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Not authenticated' })
    }
  }

  // Parse request body
  let tier: string
  try {
    const body = JSON.parse(event.body || '{}')
    tier = body.tier
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request body' })
    }
  }

  // Validate tier
  const priceId = PRICE_MAP[tier]
  if (!priceId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid subscription tier' })
    }
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY not configured')
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Payment system not configured' })
    }
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-02-24.acacia'
  })

  const pool = getPool()

  try {
    // Check subscription cap
    const limitsResult = await pool.query(
      'SELECT total_cap, current_total FROM subscription_limits LIMIT 1'
    )
    if (limitsResult.rows.length > 0) {
      const { total_cap, current_total } = limitsResult.rows[0]
      if (current_total >= total_cap) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: 'All spots filled',
            message: 'We have reached our member cap. Join the waitlist to be notified when spots open up.'
          })
        }
      }
    }

    // Fetch user from database
    const userResult = await pool.query(
      `SELECT id, email, name, stripe_customer_id, subscription_status, subscription_tier
       FROM users WHERE id = $1`,
      [session.userId]
    )

    if (userResult.rows.length === 0) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      }
    }

    const user = userResult.rows[0]

    // Check if user has comp status
    if (user.subscription_status === 'comp') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: 'Complimentary access',
          message: 'You already have complimentary access to ASHE.'
        })
      }
    }

    // Check if user already has an active subscription
    if (user.subscription_status === 'active' && user.stripe_customer_id) {
      // Redirect to portal instead
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Already subscribed',
          message: 'You already have an active subscription. Use the Manage Subscription option to change your plan.',
          redirect: 'portal'
        })
      }
    }

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          user_id: String(user.id)
        }
      })
      customerId = customer.id

      // Save customer ID to database
      await pool.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, user.id]
      )
    }

    // Determine base URL for redirects
    const host = event.headers['host'] || event.headers['Host'] || 'swingtree.ai'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    // Create Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/main?subscription=success`,
      cancel_url: `${baseUrl}/main?subscription=cancelled`,
      metadata: {
        user_id: String(user.id),
        tier: tier
      },
      subscription_data: {
        metadata: {
          user_id: String(user.id),
          tier: tier
        }
      },
      allow_promotion_codes: true
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: checkoutSession.url,
        tier: TIER_NAMES[tier]
      })
    }
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create checkout session',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
