import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db.js'

/**
 * Subscription Limits
 *
 * Returns public subscription limit information (for displaying remaining spots).
 *
 * Endpoint: GET /api/subscription-limits
 *
 * Response:
 * - 200: { cap: number, current: number, remaining: number }
 */

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const pool = getPool()
    const result = await pool.query(
      'SELECT total_cap, current_total FROM subscription_limits LIMIT 1'
    )

    const limits = result.rows[0] || { total_cap: 3000, current_total: 0 }
    const cap = limits.total_cap
    const current = limits.current_total
    const remaining = Math.max(cap - current, 0)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cap,
        current,
        remaining
      })
    }
  } catch (error) {
    console.error('Error fetching subscription limits:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
