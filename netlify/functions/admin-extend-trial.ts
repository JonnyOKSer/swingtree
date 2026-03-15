import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Extend Trial
 *
 * Extends a user's trial period. Only accessible by admins.
 *
 * Endpoint: POST /api/admin-extend-trial
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "additionalDays": 7
 * }
 *
 * Response:
 * - 200: { success: true, user: { email, trialEnd } }
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
  let additionalDays: number

  try {
    const body = JSON.parse(event.body || '{}')
    email = body.email
    additionalDays = parseInt(body.additionalDays)
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' })
    }
  }

  if (!email || !additionalDays || additionalDays < 1) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Email and additionalDays (positive integer) are required' })
    }
  }

  // Cap at 365 days to prevent accidents
  additionalDays = Math.min(additionalDays, 365)

  try {
    const pool = getPool()

    // Update trial_end, extending from current trial_end or NOW if expired
    const result = await pool.query(`
      UPDATE users SET
        trial_end = GREATEST(trial_end, NOW()) + ($1 || ' days')::INTERVAL,
        subscription_status = 'trial'
      WHERE email = $2
      RETURNING email, trial_end
    `, [additionalDays, email])

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
          trialEnd: user.trial_end?.toISOString() || null
        },
        extendedBy: additionalDays
      })
    }
  } catch (error) {
    console.error('Extend trial error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
