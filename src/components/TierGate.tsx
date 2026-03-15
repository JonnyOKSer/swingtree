import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { TierAccess } from '../context/AuthContext'
import './TierGate.css'

export type GatedFeature =
  | 'firstSetWinner'
  | 'firstSetScore'
  | 'overUnder'
  | 'divergence'
  | 'disruption'

interface TierGateProps {
  feature: GatedFeature
  children: ReactNode
  blur?: boolean
  showLock?: boolean
  inline?: boolean
}

const FEATURE_TIER_MAP: Record<GatedFeature, keyof TierAccess> = {
  firstSetWinner: 'firstSetWinner',
  firstSetScore: 'firstSetScore',
  overUnder: 'overUnder',
  divergence: 'divergence',
  disruption: 'disruption'
}

const FEATURE_UPGRADE_TIER: Record<GatedFeature, string> = {
  firstSetWinner: 'All-Court',
  firstSetScore: 'Tree Top',
  overUnder: 'All-Court',
  divergence: 'All-Court',
  disruption: 'Tree Top'
}

/**
 * TierGate component gates content based on user's subscription tier.
 *
 * Features:
 * - firstSetWinner: First set winner prediction (All-Court+)
 * - firstSetScore: First set correct score (Tree Top only)
 * - overUnder: O/U 9.5 games prediction (All-Court+)
 * - divergence: Divergence alerts (All-Court+)
 * - disruption: Disruption alerts (Tree Top only)
 */
export default function TierGate({
  feature,
  children,
  blur = true,
  showLock = true,
  inline = false
}: TierGateProps) {
  const { tierAccess, isTrialExpired, isAuthenticated } = useAuth()

  // If not authenticated, show nothing (shouldn't happen on protected pages)
  if (!isAuthenticated) {
    return null
  }

  // Check if user has access to this feature
  const accessKey = FEATURE_TIER_MAP[feature]
  const hasAccess = !isTrialExpired && tierAccess[accessKey]

  if (hasAccess) {
    return <>{children}</>
  }

  // User doesn't have access - show gated content
  const upgradeTier = FEATURE_UPGRADE_TIER[feature]

  if (inline) {
    return (
      <span className="tier-gate-inline" title={`Upgrade to ${upgradeTier}`}>
        <span className={`tier-gate-content ${blur ? 'blurred' : 'hidden'}`}>
          {blur ? children : '---'}
        </span>
        {showLock && <span className="tier-lock">🔒</span>}
      </span>
    )
  }

  return (
    <div className="tier-gate">
      <div className={`tier-gate-content ${blur ? 'blurred' : 'hidden'}`}>
        {blur ? children : null}
      </div>
      {showLock && (
        <div className="tier-gate-overlay">
          <span className="tier-lock-icon">🔒</span>
          <span className="tier-upgrade-text">Upgrade to {upgradeTier}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Hook to check if a specific feature is accessible
 */
export function useFeatureAccess(feature: GatedFeature): boolean {
  const { tierAccess, isTrialExpired } = useAuth()
  const accessKey = FEATURE_TIER_MAP[feature]
  return !isTrialExpired && tierAccess[accessKey]
}
