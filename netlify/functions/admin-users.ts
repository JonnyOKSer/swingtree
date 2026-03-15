import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: List Users
 *
 * Returns all users with subscription info. Only accessible by admins.
 *
 * Endpoint: GET /api/admin-users
 *
 * Query params:
 * - search: Filter by email (optional)
 * - tier: Filter by tier (optional)
 * - limit: Max results (default 50)
 * - offset: Pagination offset (default 0)
 *
 * Response:
 * - 200: { users: [...], total: number, limits: { cap, current } }
 * - 403: { error: "Admin access required" }
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

  // Check admin session
  const session = parseSessionFromCookies(event.headers.cookie)

  if (!session || !session.isAdmin) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Admin access required' })
    }
  }

  // Parse query params
  const params = event.queryStringParameters || {}
  const search = params.search || null
  const tier = params.tier || null
  const limit = Math.min(parseInt(params.limit || '50'), 100)
  const offset = parseInt(params.offset || '0')

  try {
    const pool = getPool()

    // Build query
    let query = `
      SELECT
        id, email, name, avatar_url, auth_provider,
        subscription_tier, subscription_status, trial_end,
        is_admin, comp_granted_by, comp_reason, comp_tier,
        created_at, last_login, login_count
      FROM users
      WHERE 1=1
    `
    const queryParams: (string | number)[] = []
    let paramIndex = 1

    if (search) {
      queryParams.push(`%${search}%`)
      query += ` AND email ILIKE $${paramIndex++}`
    }

    if (tier) {
      queryParams.push(tier)
      query += ` AND subscription_tier = $${paramIndex++}`
    }

    // Add count query
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')

    // Add ordering and pagination to main query
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
    queryParams.push(limit, offset)

    // Execute queries
    const [usersResult, countResult, limitsResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2)),
      pool.query('SELECT total_cap, current_total FROM subscription_limits LIMIT 1')
    ])

    const users = usersResult.rows.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      authProvider: user.auth_provider,
      tier: user.subscription_tier,
      status: user.subscription_status,
      trialEnd: user.trial_end?.toISOString() || null,
      isAdmin: user.is_admin,
      compGrantedBy: user.comp_granted_by,
      compReason: user.comp_reason,
      compTier: user.comp_tier,
      createdAt: user.created_at?.toISOString() || null,
      lastLogin: user.last_login?.toISOString() || null,
      loginCount: user.login_count
    }))

    const total = parseInt(countResult.rows[0].count)
    const limits = limitsResult.rows[0] || { total_cap: 3000, current_total: 0 }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users,
        total,
        limits: {
          cap: limits.total_cap,
          current: limits.current_total
        }
      })
    }
  } catch (error) {
    console.error('List users error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
