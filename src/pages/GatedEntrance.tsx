import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SerengetiScene from '../components/SerengetiScene'
import './GatedEntrance.css'

export default function GatedEntrance() {
  const [code, setCode] = useState('')
  const [shake, setShake] = useState(false)
  const [entering, setEntering] = useState(false)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, loading } = useAuth()

  // Check for welcome param (new user redirect)
  useEffect(() => {
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true)
      // Clear the param from URL
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Check for error param
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      let message = 'Something went wrong. Please try again.'
      switch (error) {
        case 'cap_reached':
          message = 'ASHE has reached maximum capacity. Join the waitlist.'
          break
        case 'invalid_state':
          message = 'Session expired. Please try signing in again.'
          break
        case 'oauth_error':
          message = 'Sign-in was cancelled or failed.'
          break
      }
      setCodeError(message)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/main')
    }
  }, [loading, isAuthenticated, navigate])

  // Focus input when code section expands
  useEffect(() => {
    if (showCodeInput) {
      inputRef.current?.focus()
    }
  }, [showCodeInput])

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth-google'
  }

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCodeError('')

    if (!code.trim()) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    setCodeLoading(true)

    try {
      const response = await fetch('/api/auth-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        // Code is valid, redirect to Google OAuth
        // The pending code cookie will be picked up by the callback
        window.location.href = '/api/auth-google'
      } else {
        setCodeError(data.error || 'Invalid or expired code')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        setCode('')
      }
    } catch (error) {
      setCodeError('Network error. Please try again.')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setCodeLoading(false)
    }
  }

  const handleCloseWelcome = () => {
    setShowWelcome(false)
    setEntering(true)
    setTimeout(() => {
      navigate('/main')
    }, 800)
  }

  // Show nothing while checking auth
  if (loading) {
    return (
      <div className="gated-entrance">
        <SerengetiScene />
      </div>
    )
  }

  return (
    <div className={`gated-entrance ${entering ? 'entering' : ''}`}>
      <SerengetiScene />

      <div className="entrance-content">
        <h1 className="wordmark serif">ASHE</h1>
        <p className="tagline mono">Autonomous Signal Harvesting Engine</p>

        {/* OAuth Button */}
        <div className="auth-buttons">
          <button
            className="oauth-btn google-btn"
            onClick={handleGoogleLogin}
            disabled={codeLoading}
          >
            <svg className="oauth-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Divider */}
        <div className="auth-divider">
          <span className="divider-line"></span>
          <button
            className="divider-text"
            onClick={() => setShowCodeInput(!showCodeInput)}
          >
            {showCodeInput ? 'Back to sign in' : 'Have an access code?'}
          </button>
          <span className="divider-line"></span>
        </div>

        {/* Access Code Form */}
        {showCodeInput && (
          <form onSubmit={handleCodeSubmit} className={`code-form ${shake ? 'shake' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setCodeError('')
              }}
              placeholder="ASHE-XXXX-XXXX"
              className="code-input mono"
              autoComplete="off"
              spellCheck={false}
              disabled={codeLoading}
            />
            <button type="submit" className="enter-btn" disabled={codeLoading}>
              {codeLoading ? 'Verifying...' : 'Redeem'}
            </button>
            {codeError && <p className="code-error">{codeError}</p>}
          </form>
        )}

        <Link to="/results" className="track-record-link">
          View our track record
        </Link>
      </div>

      {/* Welcome Overlay for new users */}
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-modal">
            <h2 className="serif">Welcome to ASHE.</h2>
            <p className="welcome-text">
              Your 7-day free trial starts now.
            </p>
            <p className="welcome-subtext">
              Full Tree Top access — every feature, every prediction.
              After 7 days, choose your tier.
            </p>
            <button className="welcome-btn" onClick={handleCloseWelcome}>
              Start Exploring
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
