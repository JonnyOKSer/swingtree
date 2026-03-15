import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import Stripe from 'stripe'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Stripe Customer Portal
 *
 * Creates a Stripe Customer Portal session for self-service billing management.
 *
 * Endpoint: POST /api/stripe-portal
 *
 * Response:
 * - 200: { url: string } - Portal URL
 * - 401: { error: string } - Not authenticated
 * - 403: { error: string } - No active subscription
 */

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
    // Fetch user from database
    const userResult = await pool.query(
      `SELECT stripe_customer_id, subscription_status FROM users WHERE id = $1`,
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

    // Check if user has a Stripe customer ID
    if (!user.stripe_customer_id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: 'No subscription found',
          message: 'You need to subscribe first before managing your subscription.'
        })
      }
    }

    // Determine base URL for return
    const host = event.headers['host'] || event.headers['Host'] || 'swingtree.ai'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    // Create Billing Portal Session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/main`
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: portalSession.url })
    }
  } catch (error) {
    console.error('Stripe portal error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to open billing portal',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
