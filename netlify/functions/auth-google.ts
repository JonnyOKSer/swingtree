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
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('GOOGLE_CLIENT_ID not configured')
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OAuth not configured' })
    }
  }

  // Generate CSRF state token
  const state = generateStateToken()
  const stateCookie = createStateCookie(state)

  // Build Google OAuth URL
  const baseUrl = getBaseUrl()
  // Use /.netlify/functions/ path since that's what Google Console typically has
  const redirectUri = `${baseUrl}/.netlify/functions/auth-callback`

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.set('client_id', clientId)
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
  googleAuthUrl.searchParams.set('response_type', 'code')
  googleAuthUrl.searchParams.set('scope', 'openid email profile')
  googleAuthUrl.searchParams.set('state', state)
  googleAuthUrl.searchParams.set('access_type', 'offline')
  googleAuthUrl.searchParams.set('prompt', 'consent')

  // Log the full URL for debugging
  console.log('=== GOOGLE OAUTH DEBUG ===')
  console.log('Base URL:', baseUrl)
  console.log('Redirect URI:', redirectUri)
  console.log('Full Google OAuth URL:', googleAuthUrl.toString())
  console.log('==========================')

  return {
    statusCode: 302,
    headers: {
      Location: googleAuthUrl.toString(),
      'Set-Cookie': stateCookie
    },
    body: ''
  }
}
