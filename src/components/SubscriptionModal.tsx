import { useState, useEffect } from 'react'
import './SubscriptionModal.css'

interface SubscriptionModalProps {
  onClose: () => void
  reason?: 'trial_expired' | 'feature_gated' | 'voluntary'
}

interface SubscriptionLimits {
  cap: number
  current: number
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
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null)
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  useEffect(() => {
    // Fetch current subscription limits
    const fetchLimits = async () => {
      try {
        const response = await fetch('/api/admin-users', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setLimits(data.limits)
        }
      } catch {
        // Non-admin users won't have access, use default
        setLimits({ cap: 3000, current: 0 })
      }
    }
    fetchLimits()
  }, [])

  const handleSubscribe = (tierId: string) => {
    setSelectedTier(tierId)
    // For now, show "coming soon" - Stripe integration will come later
  }

  const remainingSpots = limits ? limits.cap - limits.current : null

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

        <div className="tier-cards">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={`tier-card ${tier.highlighted ? 'highlighted' : ''} ${selectedTier === tier.id ? 'selected' : ''}`}
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
              >
                {selectedTier === tier.id ? 'Coming Soon' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>

        {remainingSpots !== null && (
          <p className="spots-remaining">
            <span className="spots-number">{remainingSpots.toLocaleString()}</span> spots remaining
          </p>
        )}

        {selectedTier && (
          <div className="coming-soon-notice">
            <p>
              Stripe payment integration coming soon.
              <br />
              We'll notify you when subscriptions go live.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
