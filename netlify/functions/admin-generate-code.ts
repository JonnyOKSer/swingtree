import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { parseSessionFromCookies, generateAccessCode, hashCode } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Admin: Generate Access Code
 *
 * Creates a new single-use access code. Only accessible by admins.
 *
 * Endpoint: POST /api/admin-generate-code
 *
 * Request body:
 * {
 *   "intendedFor": "VIP Name",      // optional
 *   "compTier": "tree_top",         // optional, defaults to tree_top
 *   "expiresHours": 48              // optional, defaults to 48
 * }
 *
 * Response:
 * - 200: { code: "ASHE-XXXX-XXXX", expiresAt: "2026-03-17T..." }
 * - 403: { error: "Admin access required" }
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
  let intendedFor: string | null = null
  let compTier = 'tree_top'
  let expiresHours = 48

  try {
    const body = JSON.parse(event.body || '{}')
    intendedFor = body.intendedFor || null
    compTier = body.compTier || 'tree_top'
    expiresHours = body.expiresHours || 48
  } catch {
    // Use defaults
  }

  try {
    // Generate code and hash
    const plainCode = generateAccessCode()
    const codeHash = await hashCode(plainCode)

    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresHours)

    // Insert into database
    const pool = getPool()
    await pool.query(`
      INSERT INTO access_codes (code_hash, created_by, intended_for, comp_tier, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [codeHash, session.email, intendedFor, compTier, expiresAt])

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: plainCode,
        expiresAt: expiresAt.toISOString(),
        tier: compTier,
        intendedFor
      })
    }
  } catch (error) {
    console.error('Generate code error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
