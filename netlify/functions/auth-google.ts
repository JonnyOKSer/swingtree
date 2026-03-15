import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { generateStateToken, createStateCookie, getBaseUrl } from './auth-utils.js'

/**
 * Google OAuth Login Initiator
 *
 * Redirects the user to Google's OAuth consent screen.
 * Sets a state cookie for CSRF protection.
 *
 * Endpoint: GET /api/auth-google
 */
export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log('[auth-google] Function invoked')
  console.log('[auth-google] HTTP Method:', event.httpMethod)
  console.log('[auth-google] Headers:', JSON.stringify(event.headers, null, 2))

  try {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
      console.log('[auth-google] Method not allowed:', event.httpMethod)
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    console.log('[auth-google] GOOGLE_CLIENT_ID exists:', !!clientId)

    if (!clientId) {
      console.error('[auth-google] ERROR: GOOGLE_CLIENT_ID not configured')
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OAuth not configured' })
      }
    }

    // Generate CSRF state token
    const state = generateStateToken()
    const stateCookie = createStateCookie(state)
    console.log('[auth-google] State token generated')

    // Build Google OAuth URL - pass headers for host detection
    const baseUrl = getBaseUrl(event.headers)
    // Use /.netlify/functions/ path since that's what Google Console typically has
    const redirectUri = `${baseUrl}/.netlify/functions/auth-callback`

    console.log('[auth-google] Base URL:', baseUrl)
    console.log('[auth-google] Redirect URI:', redirectUri)

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', clientId)
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', 'openid email profile')
    googleAuthUrl.searchParams.set('state', state)
    googleAuthUrl.searchParams.set('access_type', 'offline')
    googleAuthUrl.searchParams.set('prompt', 'consent')

    const finalUrl = googleAuthUrl.toString()
    console.log('[auth-google] Redirecting to:', finalUrl)

    return {
      statusCode: 302,
      headers: {
        'Location': finalUrl,
        'Set-Cookie': stateCookie,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
    }
  } catch (error) {
    console.error('[auth-google] UNCAUGHT ERROR:', error)
    console.error('[auth-google] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
