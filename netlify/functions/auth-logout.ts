import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { createLogoutCookie, getBaseUrl } from './auth-utils.js'

/**
 * Logout Endpoint
 *
 * Clears the session cookie and redirects to the entrance page.
 *
 * Endpoint: POST /api/auth-logout
 *
 * Response: 302 redirect to /
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Allow both POST and GET for convenience
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  const baseUrl = getBaseUrl()
  const logoutCookie = createLogoutCookie()

  return {
    statusCode: 302,
    headers: {
      Location: baseUrl + '/',
      'Set-Cookie': logoutCookie
    },
    body: ''
  }
}
