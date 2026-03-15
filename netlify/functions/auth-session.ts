import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies, getEffectiveStatus, SessionUser } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Session Info Endpoint
 *
 * Returns the current user's session information from the JWT cookie.
 * Fetches fresh user data from the database to ensure accuracy.
 *
 * Endpoint: GET /api/auth-session
 *
 * Response:
 * - 200: { user: SessionUser }
 * - 401: { error: 'Not authenticated' }
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Parse session from cookie
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not authenticated' })
    }
  }

  try {
    // Fetch fresh user data from database
    const pool = getPool()
    const result = await pool.query(`
      SELECT
        id, email, name, avatar_url,
        subscription_tier, subscription_status, trial_end,
        is_admin, comp_tier
      FROM users
      WHERE id = $1
    `, [session.userId])

    if (result.rows.length === 0) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' })
      }
    }

    const dbUser = result.rows[0]

    // Calculate effective status
    const effectiveStatus = getEffectiveStatus(
      dbUser.subscription_tier,
      dbUser.subscription_status,
      dbUser.trial_end?.toISOString() || null
    )

    const user: SessionUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      tier: dbUser.subscription_tier,
      status: effectiveStatus,
      trialEnd: dbUser.trial_end?.toISOString() || null,
      isAdmin: dbUser.is_admin
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    }
  } catch (error) {
    console.error('Session fetch error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
