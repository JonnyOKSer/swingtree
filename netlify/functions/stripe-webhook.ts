import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import Stripe from 'stripe'
import { getPool } from './db.js'

/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events to update user subscriptions.
 *
 * Endpoint: POST /api/stripe-webhook
 *
 * Events handled:
 * - checkout.session.completed: User completed checkout
 * - customer.subscription.updated: Subscription changed (upgrade/downgrade/status)
 * - customer.subscription.deleted: Subscription cancelled
 * - invoice.payment_failed: Payment failed
 */

const PRICE_TO_TIER: Record<string, string> = {}

// Initialize price mappings (populated from env vars)
function initPriceMappings() {
  if (process.env.STRIPE_PRICE_BASELINE) {
    PRICE_TO_TIER[process.env.STRIPE_PRICE_BASELINE] = 'baseline'
  }
  if (process.env.STRIPE_PRICE_ALL_COURT) {
    PRICE_TO_TIER[process.env.STRIPE_PRICE_ALL_COURT] = 'all_court'
  }
  if (process.env.STRIPE_PRICE_TREE_TOP) {
    PRICE_TO_TIER[process.env.STRIPE_PRICE_TREE_TOP] = 'tree_top'
  }
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method not allowed'
    }
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe credentials not configured')
    return {
      statusCode: 500,
      body: 'Webhook not configured'
    }
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-02-24.acacia'
  })

  // Get the signature from headers
  const signature = event.headers['stripe-signature']
  if (!signature) {
    console.error('No stripe-signature header')
    return {
      statusCode: 400,
      body: 'Missing signature'
    }
  }

  // Verify webhook signature using raw body
  let stripeEvent: Stripe.Event
  try {
    // event.body is the raw body string, which is what we need for signature verification
    stripeEvent = stripe.webhooks.constructEvent(
      event.body || '',
      signature,
      webhookSecret
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return {
      statusCode: 400,
      body: 'Invalid signature'
    }
  }

  // Initialize price mappings
  initPriceMappings()

  const pool = getPool()

  console.log(`[stripe-webhook] Received event: ${stripeEvent.type}`)

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session

        // Only handle subscription checkouts
        if (session.mode !== 'subscription') {
          console.log('[stripe-webhook] Ignoring non-subscription checkout')
          break
        }

        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        const userId = session.metadata?.user_id
        const tier = session.metadata?.tier

        if (!userId || !tier) {
          console.error('[stripe-webhook] Missing metadata in checkout session')
          break
        }

        console.log(`[stripe-webhook] Checkout completed: user=${userId}, tier=${tier}`)

        // Check if this subscription is already recorded (idempotency)
        const existingResult = await pool.query(
          `SELECT subscription_status FROM users WHERE id = $1 AND stripe_subscription_id = $2`,
          [userId, subscriptionId]
        )

        if (existingResult.rows.length > 0 && existingResult.rows[0].subscription_status === 'active') {
          console.log('[stripe-webhook] Subscription already recorded, skipping')
          break
        }

        // Update user with subscription info
        await pool.query(`
          UPDATE users SET
            stripe_customer_id = $1,
            stripe_subscription_id = $2,
            subscription_tier = $3,
            subscription_status = 'active'
          WHERE id = $4
        `, [customerId, subscriptionId, tier, userId])

        // Increment subscription counter (only if not already counted)
        const userResult = await pool.query(
          `SELECT subscription_status FROM users WHERE id = $1`,
          [userId]
        )
        const previousStatus = userResult.rows[0]?.subscription_status

        // Only increment if user wasn't already active
        if (previousStatus !== 'active') {
          await pool.query(`
            UPDATE subscription_limits
            SET current_total = current_total + 1
            WHERE id = 1
          `)
        }

        console.log(`[stripe-webhook] User ${userId} activated with tier ${tier}`)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID
        const userResult = await pool.query(
          `SELECT id, subscription_status FROM users WHERE stripe_customer_id = $1`,
          [customerId]
        )

        if (userResult.rows.length === 0) {
          console.log(`[stripe-webhook] No user found for customer ${customerId}`)
          break
        }

        const user = userResult.rows[0]

        // Get the current price ID to determine tier
        const priceId = subscription.items.data[0]?.price?.id
        const newTier = priceId ? PRICE_TO_TIER[priceId] : null

        // Map Stripe status to our status
        let newStatus: string
        switch (subscription.status) {
          case 'active':
          case 'trialing':
            newStatus = 'active'
            break
          case 'past_due':
            newStatus = 'past_due'
            break
          case 'canceled':
          case 'unpaid':
            newStatus = 'cancelled'
            break
          default:
            newStatus = subscription.status
        }

        console.log(`[stripe-webhook] Subscription updated: user=${user.id}, tier=${newTier}, status=${newStatus}`)

        // Update user
        await pool.query(`
          UPDATE users SET
            subscription_tier = COALESCE($1, subscription_tier),
            subscription_status = $2,
            stripe_subscription_id = $3
          WHERE id = $4
        `, [newTier, newStatus, subscription.id, user.id])

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID
        const userResult = await pool.query(
          `SELECT id, subscription_status FROM users WHERE stripe_customer_id = $1`,
          [customerId]
        )

        if (userResult.rows.length === 0) {
          console.log(`[stripe-webhook] No user found for customer ${customerId}`)
          break
        }

        const user = userResult.rows[0]
        const wasActive = user.subscription_status === 'active'

        console.log(`[stripe-webhook] Subscription deleted: user=${user.id}`)

        // Update user to expired
        await pool.query(`
          UPDATE users SET
            subscription_tier = 'expired',
            subscription_status = 'cancelled',
            stripe_subscription_id = NULL
          WHERE id = $1
        `, [user.id])

        // Decrement counter only if user was active
        if (wasActive) {
          await pool.query(`
            UPDATE subscription_limits
            SET current_total = GREATEST(current_total - 1, 0)
            WHERE id = 1
          `)
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by customer ID
        const userResult = await pool.query(
          `SELECT id FROM users WHERE stripe_customer_id = $1`,
          [customerId]
        )

        if (userResult.rows.length === 0) {
          console.log(`[stripe-webhook] No user found for customer ${customerId}`)
          break
        }

        const user = userResult.rows[0]

        console.log(`[stripe-webhook] Payment failed: user=${user.id}`)

        // Mark as past due (user retains access while Stripe retries)
        await pool.query(`
          UPDATE users SET subscription_status = 'past_due' WHERE id = $1
        `, [user.id])

        break
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${stripeEvent.type}`)
    }

    // Always return 200 to acknowledge receipt
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    }
  } catch (error) {
    console.error('[stripe-webhook] Error processing event:', error)
    // Still return 200 to prevent Stripe from retrying
    // Log the error for investigation
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, error: 'Processing error logged' })
    }
  }
}
