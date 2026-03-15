import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

// User session from the auth-session endpoint
export interface User {
  id: number
  email: string
  name: string | null
  tier: 'trial' | 'baseline' | 'all_court' | 'tree_top' | 'expired'
  status: 'trial' | 'active' | 'expired' | 'cancelled' | 'comp' | 'past_due'
  trialEnd: string | null
  isAdmin: boolean
}

// Feature access based on tier
export interface TierAccess {
  // All tiers see all confidence labels (STRONG, CONFIDENT, PICK, SKIP)
  allTournaments: boolean      // false for baseline (Slams + Masters only)
  firstSetWinner: boolean      // false for baseline
  firstSetScore: boolean       // only tree_top
  overUnder: boolean           // false for baseline
  divergence: boolean          // false for baseline
  disruption: boolean          // only tree_top
  earlyAccess: boolean         // only tree_top
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  isTrialExpired: boolean
  hasActiveSubscription: boolean
  isSubscriptionPastDue: boolean
  isCompUser: boolean
  tierAccess: TierAccess
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

// Default tier access (trial gets full access during trial period)
const TIER_ACCESS: Record<string, TierAccess> = {
  trial: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: true,
    overUnder: true,
    divergence: true,
    disruption: true,
    earlyAccess: true
  },
  baseline: {
    allTournaments: false,  // Slams + Masters only
    firstSetWinner: false,
    firstSetScore: false,
    overUnder: false,
    divergence: false,
    disruption: false,
    earlyAccess: false
  },
  all_court: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: false,   // only tree_top
    overUnder: true,
    divergence: true,
    disruption: false,      // only tree_top
    earlyAccess: false      // only tree_top
  },
  tree_top: {
    allTournaments: true,
    firstSetWinner: true,
    firstSetScore: true,
    overUnder: true,
    divergence: true,
    disruption: true,
    earlyAccess: true
  }
}

// Expired trial gets no access
const EXPIRED_ACCESS: TierAccess = {
  allTournaments: false,
  firstSetWinner: false,
  firstSetScore: false,
  overUnder: false,
  divergence: false,
  disruption: false,
  earlyAccess: false
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth-session', {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Session check error:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const logout = async () => {
    try {
      // Call logout endpoint which clears cookie and redirects
      window.location.href = '/api/auth-logout'
    } catch (error) {
      console.error('Logout error:', error)
      // Fallback: just clear local state and redirect
      setUser(null)
      window.location.href = '/'
    }
  }

  // Check if trial has expired
  const isTrialExpired = (() => {
    if (!user) return false
    if (user.status === 'comp' || user.status === 'active') return false
    if (user.tier !== 'trial') return false
    if (!user.trialEnd) return false
    return new Date(user.trialEnd) < new Date()
  })()

  // Get tier access based on user's tier and status
  const tierAccess = (() => {
    if (!user) return EXPIRED_ACCESS
    if (isTrialExpired) return EXPIRED_ACCESS
    if (user.status === 'expired') return EXPIRED_ACCESS
    return TIER_ACCESS[user.tier] || EXPIRED_ACCESS
  })()

  // Subscription status helpers
  const hasActiveSubscription = user?.status === 'active' || user?.status === 'comp'
  const isSubscriptionPastDue = user?.status === 'past_due'
  const isCompUser = user?.status === 'comp'

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: user !== null,
    isTrialExpired,
    hasActiveSubscription,
    isSubscriptionPastDue,
    isCompUser,
    tierAccess,
    logout,
    checkSession
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Check if a tournament is accessible for the given tier
 * Baseline only has access to Grand Slams and Masters 1000
 */
export function isTournamentAccessible(
  category: string,
  tierAccess: TierAccess
): boolean {
  if (tierAccess.allTournaments) return true

  // Baseline: only Grand Slams and Masters 1000
  const allowedCategories = [
    'Grand Slam',
    'ATP 1000',
    'WTA 1000',
    'ATP Finals',
    'WTA Finals'
  ]

  return allowedCategories.some(allowed =>
    category.toLowerCase().includes(allowed.toLowerCase())
  )
}
