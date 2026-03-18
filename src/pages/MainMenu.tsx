import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SubscriptionModal from '../components/SubscriptionModal'
import AsheTicker, { type MatchResult } from '../components/AsheTicker'
import Footer from '../components/Footer'
import './MainMenu.css'

const TIER_NAMES: Record<string, string> = {
  trial: 'Trial',
  baseline: 'Baseline',
  all_court: 'All-Court',
  tree_top: 'Tree Top'
}

export default function MainMenu() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, loading, logout, user, checkSession } = useAuth()
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'warning'; message: string } | null>(null)
  const [processingSubscription, setProcessingSubscription] = useState(false)
  const [tickerMatches, setTickerMatches] = useState<MatchResult[]>([])

  // Fetch ticker data
  useEffect(() => {
    const fetchTickerData = async () => {
      try {
        const response = await fetch('/api/ticker')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.matches) {
            setTickerMatches(data.matches)
          }
        }
      } catch (error) {
        console.error('Failed to fetch ticker data:', error)
      }
    }

    fetchTickerData()
    // Refresh ticker every 2 minutes
    const interval = setInterval(fetchTickerData, 120000)
    return () => clearInterval(interval)
  }, [])

  // Handle URL params for subscription status
  useEffect(() => {
    const subscription = searchParams.get('subscription')
    const welcome = searchParams.get('welcome')

    if (subscription === 'success') {
      setProcessingSubscription(true)
      setNotification({
        type: 'info',
        message: 'Processing your subscription...'
      })

      // Poll for session update (webhook may take a moment)
      let attempts = 0
      const maxAttempts = 10
      const pollInterval = setInterval(async () => {
        attempts++
        await checkSession()

        // Check if user now has active status
        if (user?.status === 'active' || attempts >= maxAttempts) {
          clearInterval(pollInterval)
          setProcessingSubscription(false)

          if (user?.status === 'active') {
            const tierName = TIER_NAMES[user.tier] || user.tier
            setNotification({
              type: 'success',
              message: `Welcome to ${tierName}! Your subscription is active.`
            })
          } else if (attempts >= maxAttempts) {
            setNotification({
              type: 'success',
              message: 'Subscription successful! Your access will be updated shortly.'
            })
          }
        }
      }, 1500)

      // Clean up URL
      setSearchParams({})

      return () => clearInterval(pollInterval)
    }

    if (subscription === 'cancelled') {
      setNotification({
        type: 'info',
        message: 'Subscription not completed. You can subscribe anytime.'
      })
      setSearchParams({})
    }

    if (welcome === 'true') {
      setNotification({
        type: 'success',
        message: 'Welcome to ASHE! Your 7-day free trial has started.'
      })
      setSearchParams({})
    }
  }, [searchParams, setSearchParams, checkSession, user])

  // Clear notification after delay
  useEffect(() => {
    if (notification && !processingSubscription) {
      const timer = setTimeout(() => setNotification(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [notification, processingSubscription])

  useEffect(() => {
    // Check authentication
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate])

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/stripe-portal', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok && data.url) {
        window.location.href = data.url
      } else {
        setNotification({
          type: 'warning',
          message: data.message || 'Unable to open billing portal.'
        })
      }
    } catch {
      setNotification({
        type: 'warning',
        message: 'Something went wrong. Please try again.'
      })
    }
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="main-menu">
        <h1 className="menu-wordmark serif">ASHE</h1>
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  const hasActiveSubscription = user?.status === 'active'
  const isCompUser = user?.status === 'comp'
  const isPastDue = user?.status === 'past_due'

  return (
    <div className="main-menu">
      {tickerMatches.length > 0 && (
        <AsheTicker matches={tickerMatches} position="top" />
      )}

      <h1 className="menu-wordmark serif">ASHE</h1>

      {notification && (
        <div className={`menu-notification ${notification.type}`}>
          <p>{notification.message}</p>
        </div>
      )}

      {isPastDue && (
        <div className="menu-notification warning">
          <p>
            Your payment failed.{' '}
            <button onClick={handleManageSubscription} className="notification-link">
              Update payment method
            </button>
          </p>
        </div>
      )}

      {user && (
        <div className="user-info">
          <p className="user-email mono">{user.email}</p>
          {(hasActiveSubscription || isCompUser) && (
            <p className="user-tier">
              {isCompUser ? 'Complimentary' : TIER_NAMES[user.tier] || user.tier}
            </p>
          )}
        </div>
      )}

      <nav className="menu-options">
        <Link to="/predict" className="menu-option">
          <span className="option-label">Predict</span>
        </Link>

        <Link to="/results" className="menu-option">
          <span className="option-label">Proof</span>
        </Link>

        <Link to="/pedigree" className="menu-option">
          <span className="option-label">Pedigree</span>
        </Link>

        {/* Show Subscribe for trial/expired users, Manage for active subscribers */}
        {!isCompUser && (
          hasActiveSubscription ? (
            <button onClick={handleManageSubscription} className="menu-option">
              <span className="option-label">Manage</span>
            </button>
          ) : (
            <button onClick={() => setShowSubscriptionModal(true)} className="menu-option subscribe">
              <span className="option-label">Subscribe</span>
            </button>
          )
        )}

        <button onClick={logout} className="menu-option logout">
          <span className="option-label">Peace</span>
        </button>
      </nav>

      {showSubscriptionModal && (
        <SubscriptionModal
          reason="voluntary"
          onClose={() => setShowSubscriptionModal(false)}
        />
      )}

      <Footer />
    </div>
  )
}
