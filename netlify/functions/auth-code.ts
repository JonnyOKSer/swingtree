import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { verifyCode, createPendingCodeCookie } from './auth-utils.js'
import { getPool } from './db.js'

/**
 * Access Code Validation Endpoint
 *
 * Validates an access code and prepares for OAuth flow.
 * If valid, stores the code in a cookie for redemption after OAuth.
 *
 * Endpoint: POST /api/auth-code
 *
 * Request body: { "code": "ASHE-XXXX-XXXX" }
 *
 * Response:
 * - 200: { valid: true, tier: "tree_top", requiresOAuth: true }
 * - 401: { error: "Invalid or expired code" }
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

  // Parse request body
  let code: string
  try {
    const body = JSON.parse(event.body || '{}')
    code = body.code
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' })
    }
  }

  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Code is required' })
    }
  }

  try {
    const pool = getPool()

    // Find all active, unused, non-expired codes
    const codesResult = await pool.query(`
      SELECT id, code_hash, comp_tier, expires_at
      FROM access_codes
      WHERE is_active = true
        AND expires_at > NOW()
        AND used_at IS NULL
    `)

    // Check each hash
    let validCode: { id: number; tier: string } | null = null

    for (const row of codesResult.rows) {
      const isMatch = await verifyCode(code, row.code_hash)
      if (isMatch) {
        validCode = {
          id: row.id,
          tier: row.comp_tier || 'tree_top'
        }
        break
      }
    }

    if (!validCode) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid or expired code' })
      }
    }

    // Store the validated code in a cookie for the OAuth flow
    const pendingCodeCookie = createPendingCodeCookie(code, validCode.tier)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': pendingCodeCookie
      },
      body: JSON.stringify({
        valid: true,
        tier: validCode.tier,
        requiresOAuth: true
      })
    }
  } catch (error) {
    console.error('Code validation error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
