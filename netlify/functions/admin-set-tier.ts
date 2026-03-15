import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Set User Tier
 *
 * Updates a user's subscription tier. Only accessible by admins.
 *
 * Endpoint: POST /api/admin-set-tier
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "tier": "tree_top",
 *   "reason": "founding tester"
 * }
 *
 * Response:
 * - 200: { success: true, user: { email, tier, status } }
 * - 403: { error: "Admin access required" }
 * - 404: { error: "User not found" }
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Check admin session
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session || !session.isAdmin) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Admin access required' })
    }
  }

  // Parse request body
  let email: string
  let tier: string
  let reason: string | null = null

  try {
    const body = JSON.parse(event.body || '{}')
    email = body.email
    tier = body.tier
    reason = body.reason || null
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' })
    }
  }

  if (!email || !tier) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Email and tier are required' })
    }
  }

  // Validate tier
  const validTiers = ['trial', 'baseline', 'all_court', 'tree_top']
  if (!validTiers.includes(tier)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` })
    }
  }

  try {
    const pool = getPool()

    const result = await pool.query(`
      UPDATE users SET
        subscription_tier = $1,
        subscription_status = 'comp',
        comp_granted_by = $2,
        comp_reason = $3,
        comp_tier = $1
      WHERE email = $4
      RETURNING email, subscription_tier, subscription_status
    `, [tier, session.email, reason, email])

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' })
      }
    }

    const user = result.rows[0]

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        user: {
          email: user.email,
          tier: user.subscription_tier,
          status: user.subscription_status
        }
      })
    }
  } catch (error) {
    console.error('Set tier error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
