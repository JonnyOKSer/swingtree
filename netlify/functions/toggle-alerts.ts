import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Toggle Alerts Endpoint
 *
 * Toggles the user's value alert email subscription setting.
 *
 * Endpoint: POST /api/toggle-alerts
 *
 * Response:
 * - 200: { alertsEnabled: boolean }
 * - 401: { error: 'Not authenticated' }
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
    const pool = getPool()

    // Toggle alerts_enabled and return new value
    const result = await pool.query(`
      UPDATE users
      SET alerts_enabled = NOT COALESCE(alerts_enabled, false),
          updated_at = NOW()
      WHERE id = $1
      RETURNING alerts_enabled
    `, [session.userId])

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' })
      }
    }

    const alertsEnabled = result.rows[0].alerts_enabled

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertsEnabled })
    }
  } catch (error) {
    console.error('Toggle alerts error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
