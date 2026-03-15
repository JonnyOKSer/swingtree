import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import './SubscriptionModal.css'

interface SubscriptionModalProps {
  onClose: () => void
  reason?: 'trial_expired' | 'feature_gated' | 'voluntary'
}

interface SubscriptionLimits {
  cap: number
  current: number
  remaining: number
}

const TIERS = [
  {
    id: 'baseline',
    name: 'Baseline',
    price: '$29',
    period: '/mo',
    features: [
      'Grand Slams + Masters only',
      'All confidence tiers',
      'Match winner predictions'
    ],
    highlighted: false
  },
  {
    id: 'all_court',
    name: 'All-Court',
    price: '$79',
    period: '/mo',
    features: [
      'All tournaments',
      'All confidence tiers',
      'First set winner',
      'O/U 9.5 games',
      'Divergence alerts'
    ],
    highlighted: true
  },
  {
    id: 'tree_top',
    name: 'Tree Top',
    price: '$199',
    period: '/mo',
    features: [
      'Everything in All-Court',
      'First set correct score',
      'Disruption alerts',
      'Early access (2hr head start)'
    ],
    highlighted: false
  }
]

export default function SubscriptionModal({ onClose, reason = 'voluntary' }: SubscriptionModalProps) {
  const { user } = useAuth()
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch current subscription limits
    const fetchLimits = async () => {
      try {
        const response = await fetch('/api/subscription-limits')
        if (response.ok) {
          const data = await response.json()
          setLimits(data)
        }
      } catch {
        // Fallback to default
        setLimits({ cap: 3000, current: 0, remaining: 3000 })
      }
    }
    fetchLimits()
  }, [])

  const handleSubscribe = async (tierId: string) => {
    setLoading(tierId)
    setError(null)

    try {
      const response = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier: tierId })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.redirect === 'portal') {
          // User already has subscription, redirect to portal
          handleManageSubscription()
          return
        }
        setError(data.message || data.error || 'Failed to start checkout')
        setLoading(null)
        return
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  const handleManageSubscription = async () => {
    setLoading('manage')
    setError(null)

    try {
      const response = await fetch('/api/stripe-portal', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || data.error || 'Failed to open billing portal')
        setLoading(null)
        return
      }

      // Redirect to Stripe Portal
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  const isCapReached = limits && limits.remaining <= 0
  const isCompUser = user?.status === 'comp'
  const hasActiveSubscription = user?.status === 'active'

  // Comp users shouldn't see this modal
  if (isCompUser) {
    return (
      <div className="subscription-overlay" onClick={onClose}>
        <div className="subscription-modal" onClick={e => e.stopPropagation()}>
          <button className="close-modal" onClick={onClose}>×</button>
          <div className="modal-header">
            <h2 className="serif">Complimentary Access</h2>
            <p className="modal-subtitle">You have full access to ASHE</p>
          </div>
          <div className="comp-notice">
            <p>You have complimentary access to all ASHE features.</p>
            <button className="subscribe-btn" onClick={onClose}>
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="subscription-overlay" onClick={onClose}>
      <div className="subscription-modal" onClick={e => e.stopPropagation()}>
        <button className="close-modal" onClick={onClose}>×</button>

        <div className="modal-header">
          {reason === 'trial_expired' ? (
            <>
              <h2 className="serif">Your trial has ended</h2>
              <p className="modal-subtitle">Choose a tier to continue accessing ASHE predictions</p>
            </>
          ) : reason === 'feature_gated' ? (
            <>
              <h2 className="serif">Upgrade to unlock</h2>
              <p className="modal-subtitle">This feature requires a higher tier</p>
            </>
          ) : (
            <>
              <h2 className="serif">Choose Your Tier</h2>
              <p className="modal-subtitle">Unlock the full power of ASHE</p>
            </>
          )}
        </div>

        {error && (
          <div className="subscription-error">
            <p>{error}</p>
          </div>
        )}

        <div className="tier-cards">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={`tier-card ${tier.highlighted ? 'highlighted' : ''}`}
            >
              {tier.highlighted && <span className="tier-badge-popular">Most Popular</span>}
              <h3 className="tier-name">{tier.name}</h3>
              <div className="tier-price">
                <span className="price-amount">{tier.price}</span>
                <span className="price-period">{tier.period}</span>
              </div>
              <ul className="tier-features">
                {tier.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
              <button
                className="subscribe-btn"
                onClick={() => handleSubscribe(tier.id)}
                disabled={loading !== null || !!isCapReached}
              >
                {loading === tier.id ? (
                  'Processing...'
                ) : isCapReached ? (
                  'Waitlist'
                ) : hasActiveSubscription ? (
                  'Switch Plan'
                ) : (
                  'Subscribe'
                )}
              </button>
            </div>
          ))}
        </div>

        {limits && (
          <p className="spots-remaining">
            {isCapReached ? (
              <>
                <span className="spots-number">0</span> spots remaining.{' '}
                <a href="mailto:support@swingtree.ai?subject=ASHE Waitlist">Join waitlist</a>
              </>
            ) : (
              <>
                <span className="spots-number">{limits.remaining.toLocaleString()}</span> spots remaining
              </>
            )}
          </p>
        )}

        {hasActiveSubscription && (
          <div className="manage-subscription">
            <button
              className="manage-btn"
              onClick={handleManageSubscription}
              disabled={loading !== null}
            >
              {loading === 'manage' ? 'Opening...' : 'Manage Current Subscription'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
