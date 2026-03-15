import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import {
  parseOAuthState,
  parsePendingCode,
  createSessionToken,
  createSessionCookie,
  clearStateCookie,
  clearPendingCodeCookie,
  getBaseUrl,
  verifyCode,
  SessionPayload
} from './auth-utils.js'
import { getPool } from './db.js'

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token: string
}

interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
  picture: string
}

/**
 * OAuth Callback Handler
 *
 * Handles the callback from Google OAuth:
 * 1. Verifies CSRF state
 * 2. Exchanges code for tokens
 * 3. Fetches user info from Google
 * 4. Creates/updates user in database
 * 5. Handles pending access code if present
 * 6. Creates session and redirects
 *
 * Endpoint: GET /api/auth-callback
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const baseUrl = getBaseUrl()

  try {
    // Get query parameters
    const { code, state, error } = event.queryStringParameters || {}

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error)
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=oauth_error` },
        body: ''
      }
    }

    if (!code || !state) {
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=missing_params` },
        body: ''
      }
    }

    // Verify CSRF state
    const storedState = parseOAuthState(event.headers.cookie)
    if (state !== storedState) {
      console.error('State mismatch:', { received: state, stored: storedState })
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=invalid_state` },
        body: ''
      }
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('OAuth credentials not configured')
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=config_error` },
        body: ''
      }
    }

    const redirectUri = `${baseUrl}/.netlify/functions/auth-callback`

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=token_error` },
        body: ''
      }
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json()

    // Fetch user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })

    if (!userInfoResponse.ok) {
      console.error('Failed to fetch user info')
      return {
        statusCode: 302,
        headers: { Location: `${baseUrl}/?error=userinfo_error` },
        body: ''
      }
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json()

    // Check for pending access code
    let pendingCodeData: { code: string; tier: string } | null = null
    const pendingCodeCookie = parsePendingCode(event.headers.cookie)
    if (pendingCodeCookie) {
      try {
        pendingCodeData = JSON.parse(pendingCodeCookie)
      } catch {
        // Invalid cookie, ignore
      }
    }

    const pool = getPool()

    // Check subscription cap for new users
    const existingUserResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [googleUser.email]
    )
    const isNewUser = existingUserResult.rows.length === 0

    if (isNewUser) {
      const limitsResult = await pool.query(
        'SELECT total_cap, current_total FROM subscription_limits LIMIT 1'
      )
      if (limitsResult.rows.length > 0) {
        const { total_cap, current_total } = limitsResult.rows[0]
        if (current_total >= total_cap) {
          return {
            statusCode: 302,
            headers: { Location: `${baseUrl}/?error=cap_reached` },
            body: ''
          }
        }
      }
    }

    // Determine admin status
    const adminEmail = process.env.ADMIN_EMAIL
    const isAdmin = googleUser.email === adminEmail

    // Handle access code redemption
    let codeId: number | null = null
    let compTier: string | null = null

    if (pendingCodeData) {
      // Find and validate the access code
      const codesResult = await pool.query(`
        SELECT id, code_hash, comp_tier
        FROM access_codes
        WHERE is_active = true
          AND expires_at > NOW()
          AND used_at IS NULL
      `)

      for (const row of codesResult.rows) {
        const isMatch = await verifyCode(pendingCodeData.code, row.code_hash)
        if (isMatch) {
          codeId = row.id
          compTier = row.comp_tier
          break
        }
      }
    }

    // Upsert user
    let userId: number
    let userTier: string
    let userStatus: string
    let trialEnd: Date | null

    if (isNewUser) {
      // Create new user
      const tier = compTier || 'trial'
      const status = compTier ? 'comp' : 'trial'

      const insertResult = await pool.query(`
        INSERT INTO users (
          email, name, avatar_url, auth_provider, auth_provider_id,
          subscription_tier, subscription_status, is_admin,
          comp_tier, last_login, login_count
        )
        VALUES ($1, $2, $3, 'google', $4, $5, $6, $7, $8, NOW(), 1)
        RETURNING id, subscription_tier, subscription_status, trial_end
      `, [
        googleUser.email,
        googleUser.name,
        googleUser.picture,
        googleUser.id,
        tier,
        status,
        isAdmin,
        compTier
      ])

      const newUser = insertResult.rows[0]
      userId = newUser.id
      userTier = newUser.subscription_tier
      userStatus = newUser.subscription_status
      trialEnd = newUser.trial_end

      // Increment subscriber count
      await pool.query(`
        UPDATE subscription_limits SET current_total = current_total + 1 WHERE id = 1
      `)
    } else {
      // Update existing user
      const updateResult = await pool.query(`
        UPDATE users SET
          name = COALESCE(name, $1),
          avatar_url = COALESCE(avatar_url, $2),
          auth_provider_id = $3,
          last_login = NOW(),
          login_count = login_count + 1,
          is_admin = CASE WHEN is_admin THEN TRUE ELSE $4 END,
          subscription_tier = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE subscription_tier END,
          subscription_status = CASE WHEN $5::text IS NOT NULL THEN 'comp' ELSE subscription_status END,
          comp_tier = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE comp_tier END
        WHERE email = $6
        RETURNING id, subscription_tier, subscription_status, trial_end
      `, [
        googleUser.name,
        googleUser.picture,
        googleUser.id,
        isAdmin,
        compTier,
        googleUser.email
      ])

      const existingUser = updateResult.rows[0]
      userId = existingUser.id
      userTier = existingUser.subscription_tier
      userStatus = existingUser.subscription_status
      trialEnd = existingUser.trial_end
    }

    // Mark access code as used
    if (codeId) {
      await pool.query(`
        UPDATE access_codes SET used_at = NOW(), used_by = $1 WHERE id = $2
      `, [userId, codeId])
    }

    // Create session token
    const sessionPayload: SessionPayload = {
      userId,
      email: googleUser.email,
      name: googleUser.name,
      tier: userTier as SessionPayload['tier'],
      status: userStatus as SessionPayload['status'],
      trialEnd: trialEnd?.toISOString() || null,
      isAdmin
    }

    const sessionToken = createSessionToken(sessionPayload)
    const sessionCookie = createSessionCookie(sessionToken)

    // Build redirect URL
    let redirectPath = '/main'
    if (isNewUser) {
      redirectPath = '/main?welcome=true'
    }

    // Clear state and pending code cookies, set session cookie
    const cookies = [
      sessionCookie,
      clearStateCookie(),
      clearPendingCodeCookie()
    ]

    return {
      statusCode: 302,
      multiValueHeaders: {
        'Set-Cookie': cookies
      },
      headers: {
        Location: `${baseUrl}${redirectPath}`
      },
      body: ''
    }
  } catch (error) {
    console.error('OAuth callback error:', error)
    return {
      statusCode: 302,
      headers: { Location: `${baseUrl}/?error=server_error` },
      body: ''
    }
  }
}
