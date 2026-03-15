import * as jwt from 'jsonwebtoken'
import * as cookie from 'cookie'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

// Session payload stored in JWT
export interface SessionPayload {
  userId: number
  email: string
  name: string | null
  tier: 'trial' | 'baseline' | 'all_court' | 'tree_top' | 'expired'
  status: 'trial' | 'active' | 'expired' | 'cancelled' | 'comp' | 'past_due'
  trialEnd: string | null
  isAdmin: boolean
}

// User from session endpoint
export interface SessionUser {
  id: number
  email: string
  name: string | null
  tier: 'trial' | 'baseline' | 'all_court' | 'tree_top' | 'expired'
  status: 'trial' | 'active' | 'expired' | 'cancelled' | 'comp' | 'past_due'
  trialEnd: string | null
  isAdmin: boolean
}

const JWT_EXPIRY = '24h'
const COOKIE_NAME = 'ashe-session'
const STATE_COOKIE_NAME = 'oauth-state'
const CODE_COOKIE_NAME = 'pending-code'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set')
  }
  return secret
}

/**
 * Create a signed JWT session token
 */
export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY })
}

/**
 * Verify and decode a JWT session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload
  } catch {
    return null
  }
}

/**
 * Parse session from cookies header
 */
export function parseSessionFromCookies(cookieHeader: string | undefined): SessionPayload | null {
  if (!cookieHeader) return null
  const cookies = cookie.parse(cookieHeader)
  const token = cookies[COOKIE_NAME]
  return token ? verifySessionToken(token) : null
}

/**
 * Parse OAuth state from cookies
 */
export function parseOAuthState(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const cookies = cookie.parse(cookieHeader)
  return cookies[STATE_COOKIE_NAME] || null
}

/**
 * Parse pending access code from cookies
 */
export function parsePendingCode(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const cookies = cookie.parse(cookieHeader)
  return cookies[CODE_COOKIE_NAME] || null
}

/**
 * Check if current environment is production
 */
function isProduction(): boolean {
  return process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production'
}

/**
 * Create an HTTP-only secure session cookie
 */
export function createSessionCookie(token: string): string {
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/'
  })
}

/**
 * Create cookie to clear session (logout)
 */
export function createLogoutCookie(): string {
  return cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  })
}

/**
 * Create OAuth state cookie for CSRF protection
 */
export function createStateCookie(state: string): string {
  return cookie.serialize(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 60 * 5, // 5 minutes
    path: '/'
  })
}

/**
 * Create cookie to clear OAuth state
 */
export function clearStateCookie(): string {
  return cookie.serialize(STATE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  })
}

/**
 * Create pending code cookie (stores validated code during OAuth flow)
 */
export function createPendingCodeCookie(code: string, tier: string): string {
  return cookie.serialize(CODE_COOKIE_NAME, JSON.stringify({ code, tier }), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/'
  })
}

/**
 * Clear pending code cookie
 */
export function clearPendingCodeCookie(): string {
  return cookie.serialize(CODE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  })
}

/**
 * Hash an access code using bcrypt
 */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code.toUpperCase().trim(), 10)
}

/**
 * Verify an access code against a hash
 */
export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code.toUpperCase().trim(), hash)
}

/**
 * Generate a random access code in ASHE-XXXX-XXXX format
 */
export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing chars: 0, O, I, 1
  let code = 'ASHE-'
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  code += '-'
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Generate a random state token for OAuth CSRF protection
 */
export function generateStateToken(): string {
  return crypto.randomUUID()
}

/**
 * Get base URL for redirects (handles local vs production)
 *
 * Priority:
 * 1. Request host header (most reliable in Netlify Functions)
 * 2. Netlify URL env var
 * 3. Fallback to localhost for local dev
 */
export function getBaseUrl(headers?: Record<string, string | undefined>): string {
  // Try to get host from request headers first (most reliable)
  if (headers) {
    const host = headers['host'] || headers['Host']
    if (host) {
      const protocol = host.includes('localhost') ? 'http' : 'https'
      return `${protocol}://${host}`
    }
  }

  // Netlify sets URL env var in production
  if (process.env.URL) {
    return process.env.URL
  }

  // Fallback for local development
  return 'http://localhost:8888'
}

/**
 * Check if a user's trial has expired
 */
export function isTrialExpired(trialEnd: string | null, status: string): boolean {
  if (status === 'comp' || status === 'active') return false
  if (!trialEnd) return false
  return new Date(trialEnd) < new Date()
}

/**
 * Determine effective subscription status based on tier and dates
 */
export function getEffectiveStatus(
  tier: string,
  status: string,
  trialEnd: string | null
): 'trial' | 'active' | 'expired' | 'cancelled' | 'comp' | 'past_due' {
  if (status === 'comp') return 'comp'
  if (status === 'active') return 'active'
  if (status === 'past_due') return 'past_due'
  if (status === 'cancelled') return 'cancelled'
  if (tier === 'trial') {
    if (trialEnd && new Date(trialEnd) < new Date()) {
      return 'expired'
    }
    return 'trial'
  }
  return status as 'trial' | 'active' | 'expired' | 'cancelled' | 'comp' | 'past_due'
}
