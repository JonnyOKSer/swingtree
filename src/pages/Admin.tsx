import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Admin.css'

interface User {
  id: number
  email: string
  name: string | null
  tier: string
  status: string
  trialEnd: string | null
  isAdmin: boolean
  createdAt: string | null
  lastLogin: string | null
  loginCount: number
}

interface AccessCode {
  code: string
  expiresAt: string
  tier: string
  intendedFor: string | null
}

interface TierStats {
  tier: string
  total: number
  correct: number
  incorrect: number
  accuracy: number
}

interface AccuracyStats {
  byTier: TierStats[]
  overall: {
    total: number
    correct: number
    incorrect: number
    accuracy: number
  }
  firstSetWinner: {
    total: number
    correct: number
    accuracy: number
  }
  firstSetScore: {
    total: number
    correct: number
    accuracy: number
  }
  pending: number
  voided: number
  lastReconciliation: string | null
}

export default function Admin() {
  const navigate = useNavigate()
  const { user, loading, isAuthenticated } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [limits, setLimits] = useState<{ cap: number; current: number } | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [systemHealth, setSystemHealth] = useState<{ railway: 'online' | 'offline' | 'checking' }>({ railway: 'checking' })

  // Code generation form
  const [intendedFor, setIntendedFor] = useState('')
  const [compTier, setCompTier] = useState('tree_top')
  const [generatedCode, setGeneratedCode] = useState<AccessCode | null>(null)
  const [generating, setGenerating] = useState(false)

  // Set tier form
  const [tierEmail, setTierEmail] = useState('')
  const [newTier, setNewTier] = useState('tree_top')
  const [tierReason, setTierReason] = useState('')
  const [settingTier, setSettingTier] = useState(false)
  const [tierMessage, setTierMessage] = useState<string | null>(null)

  // Trigger predictions
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<{
    success: boolean
    message: string
    matches?: { atp: number; wta: number }
  } | null>(null)

  // Reconcile results
  const [reconciling, setReconciling] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<{
    success: boolean
    message: string
    updated?: number
    details?: string[]
  } | null>(null)

  // Test tweet
  const [testingTweet, setTestingTweet] = useState(false)
  const [tweetResult, setTweetResult] = useState<{
    success: boolean
    message: string
    tweet_url?: string
  } | null>(null)

  // User search filter
  const [userSearch, setUserSearch] = useState('')

  // Accuracy stats
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null)
  const [loadingAccuracy, setLoadingAccuracy] = useState(false)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    } else if (!loading && user && !user.isAdmin) {
      navigate('/main')
    }
  }, [loading, isAuthenticated, user, navigate])

  useEffect(() => {
    if (user?.isAdmin) {
      fetchUsers()
      checkSystemHealth()
      fetchAccuracyStats()
    }
  }, [user])

  const checkSystemHealth = async () => {
    setSystemHealth(prev => ({ ...prev, railway: 'checking' }))
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const response = await fetch('https://agent-production-765b.up.railway.app/health', {
        signal: controller.signal
      })
      clearTimeout(timeout)
      setSystemHealth({ railway: response.ok ? 'online' : 'offline' })
    } catch {
      setSystemHealth({ railway: 'offline' })
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchUsers(), checkSystemHealth(), fetchAccuracyStats()])
    setRefreshing(false)
  }

  const fetchAccuracyStats = async () => {
    setLoadingAccuracy(true)
    try {
      const response = await fetch('/api/accuracy-stats')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAccuracyStats(data.stats)
        }
      }
    } catch {
      console.error('Failed to fetch accuracy stats')
    } finally {
      setLoadingAccuracy(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin-users', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        setLimits(data.limits)
      } else {
        setError('Failed to load users')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    setGeneratedCode(null)

    try {
      const response = await fetch('/api/admin-generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ intendedFor: intendedFor || null, compTier })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedCode(data)
        setIntendedFor('')
      } else {
        setError('Failed to generate code')
      }
    } catch {
      setError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  const handleSetTier = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingTier(true)
    setTierMessage(null)

    try {
      const response = await fetch('/api/admin-set-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: tierEmail, tier: newTier, reason: tierReason || null })
      })

      const data = await response.json()

      if (response.ok) {
        setTierMessage(`Set ${tierEmail} to ${newTier}`)
        setTierEmail('')
        setTierReason('')
        fetchUsers()
      } else {
        setTierMessage(data.error || 'Failed to set tier')
      }
    } catch {
      setTierMessage('Network error')
    } finally {
      setSettingTier(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  const handleTriggerPredictions = async () => {
    if (!confirm('This will manually trigger the prediction pipeline. Continue?')) return

    setTriggering(true)
    setTriggerResult(null)

    try {
      const response = await fetch('/api/admin-trigger-predictions', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerResult({
          success: data.success,
          message: data.message || 'Predictions triggered',
          matches: data.matches
        })
      } else {
        setTriggerResult({
          success: false,
          message: data.error || 'Trigger failed'
        })
      }
    } catch {
      setTriggerResult({
        success: false,
        message: 'Network error'
      })
    } finally {
      setTriggering(false)
    }
  }

  const handleReconcile = async () => {
    if (!confirm('This will fetch completed match results from ESPN and update predictions. Continue?')) return

    setReconciling(true)
    setReconcileResult(null)

    try {
      const response = await fetch('/api/admin-reconcile', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok) {
        setReconcileResult({
          success: true,
          message: data.message || 'Reconciliation complete',
          updated: data.updated,
          details: data.details
        })
      } else {
        setReconcileResult({
          success: false,
          message: data.error || 'Reconciliation failed'
        })
      }
    } catch {
      setReconcileResult({
        success: false,
        message: 'Network error'
      })
    } finally {
      setReconciling(false)
    }
  }

  const handleTestTweet = async () => {
    if (!confirm('This will post a test tweet to X. Continue?')) return

    setTestingTweet(true)
    setTweetResult(null)

    try {
      const response = await fetch('https://agent-production-765b.up.railway.app/test-tweet')
      const data = await response.json()

      if (data.success) {
        setTweetResult({
          success: true,
          message: data.message || 'Test tweet posted!',
          tweet_url: data.tweet_url
        })
      } else {
        setTweetResult({
          success: false,
          message: data.error || 'Failed to post tweet'
        })
      }
    } catch {
      setTweetResult({
        success: false,
        message: 'Network error - Railway may be offline'
      })
    } finally {
      setTestingTweet(false)
    }
  }

  if (loading || !user?.isAdmin) {
    return (
      <div className="admin-page">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1 className="serif">ASHE Admin</h1>
        <Link to="/main" className="back-link">← Back to menu</Link>
      </header>

      {error && <p className="admin-error">{error}</p>}

      {/* Stats */}
      {limits && (
        <div className="admin-stats-row">
          <div className="admin-stats">
            <div className="stat-box">
              <span className="stat-value">{limits.current}</span>
              <span className="stat-label">Users</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{limits.cap - limits.current} / {limits.cap}</span>
              <span className="stat-label">Spots Available</span>
            </div>
            <div className="stat-box health-box">
              <span className={`health-indicator ${systemHealth.railway}`}>
                <span className="health-dot"></span>
                {systemHealth.railway === 'checking' ? 'Checking...' : systemHealth.railway === 'online' ? 'Railway Online' : 'Railway Offline'}
              </span>
              <span className="stat-label">System Health</span>
            </div>
          </div>
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh stats"
          >
            {refreshing ? '↻' : '⟳'}
          </button>
        </div>
      )}

      {/* Prediction Accuracy Stats */}
      <section className="admin-section accuracy-section">
        <div className="accuracy-header">
          <h2>Prediction Accuracy</h2>
          <button
            className="refresh-btn small"
            onClick={fetchAccuracyStats}
            disabled={loadingAccuracy}
            title="Refresh accuracy stats"
          >
            {loadingAccuracy ? '↻' : '⟳'}
          </button>
        </div>

        {accuracyStats?.lastReconciliation && (
          <p className="last-reconciliation">
            Last reconciliation: {new Date(accuracyStats.lastReconciliation).toLocaleString()}
          </p>
        )}

        {loadingAccuracy && !accuracyStats ? (
          <p>Loading stats...</p>
        ) : accuracyStats ? (
          <div className="accuracy-content">
            {/* Overall Stats Row */}
            <div className="accuracy-overview">
              <div className="accuracy-stat-box">
                <span className="accuracy-value">{accuracyStats.overall.correct}/{accuracyStats.overall.total}</span>
                <span className="accuracy-label">Match Winner</span>
                <span className="accuracy-pct">{accuracyStats.overall.accuracy}%</span>
              </div>
              <div className="accuracy-stat-box">
                <span className="accuracy-value">{accuracyStats.firstSetWinner.correct}/{accuracyStats.firstSetWinner.total}</span>
                <span className="accuracy-label">1st Set Winner</span>
                <span className="accuracy-pct">{accuracyStats.firstSetWinner.accuracy}%</span>
              </div>
              <div className="accuracy-stat-box">
                <span className="accuracy-value">{accuracyStats.firstSetScore.correct}/{accuracyStats.firstSetScore.total}</span>
                <span className="accuracy-label">1st Set Score</span>
                <span className="accuracy-pct">{accuracyStats.firstSetScore.accuracy}%</span>
              </div>
              <div className="accuracy-stat-box secondary">
                <span className="accuracy-value">{accuracyStats.pending}</span>
                <span className="accuracy-label">Pending</span>
              </div>
              <div className="accuracy-stat-box secondary">
                <span className="accuracy-value">{accuracyStats.voided}</span>
                <span className="accuracy-label">Voided</span>
              </div>
            </div>

            {/* By Tier Table */}
            <div className="accuracy-table-wrapper">
              <table className="accuracy-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Total</th>
                    <th>Correct</th>
                    <th>Incorrect</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracyStats.byTier.map(tier => (
                    <tr key={tier.tier} className={`tier-row tier-${tier.tier.toLowerCase()}`}>
                      <td>
                        <span className={`tier-badge tier-${tier.tier.toLowerCase()}`}>
                          {tier.tier}
                        </span>
                      </td>
                      <td>{tier.total}</td>
                      <td className="correct">{tier.correct}</td>
                      <td className="incorrect">{tier.incorrect}</td>
                      <td className="accuracy">{tier.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p>No stats available</p>
        )}
      </section>

      <div className="admin-grid">
        {/* Generate Code */}
        <section className="admin-section">
          <h2>Generate Access Code</h2>
          <form onSubmit={handleGenerateCode}>
            <input
              type="text"
              placeholder="Intended for (optional)"
              value={intendedFor}
              onChange={e => setIntendedFor(e.target.value)}
            />
            <select value={compTier} onChange={e => setCompTier(e.target.value)}>
              <option value="tree_top">Tree Top ($199)</option>
              <option value="all_court">All-Court ($79)</option>
              <option value="baseline">Baseline ($29)</option>
            </select>
            <button type="submit" disabled={generating}>
              {generating ? 'Generating...' : 'Generate Code'}
            </button>
          </form>

          {generatedCode && (
            <div className="generated-code">
              <p className="code-value mono">{generatedCode.code}</p>
              <p className="code-meta">
                Tier: {generatedCode.tier} | Expires: {formatDate(generatedCode.expiresAt)}
              </p>
            </div>
          )}
        </section>

        {/* Set Tier */}
        <section className="admin-section">
          <h2>Set User Tier</h2>
          <form onSubmit={handleSetTier}>
            <input
              type="email"
              placeholder="User email"
              value={tierEmail}
              onChange={e => setTierEmail(e.target.value)}
              required
            />
            <select value={newTier} onChange={e => setNewTier(e.target.value)}>
              <option value="tree_top">Tree Top</option>
              <option value="all_court">All-Court</option>
              <option value="baseline">Baseline</option>
              <option value="trial">Trial</option>
            </select>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={tierReason}
              onChange={e => setTierReason(e.target.value)}
            />
            <button type="submit" disabled={settingTier}>
              {settingTier ? 'Setting...' : 'Set Tier'}
            </button>
          </form>
          {tierMessage && <p className="tier-message">{tierMessage}</p>}
        </section>
      </div>

      {/* Emergency: Trigger Predictions */}
      <section className="admin-section emergency-section">
        <h2>Emergency: Trigger Predictions</h2>
        <p className="emergency-description">
          Use this if the morning cron (4am EST) failed to generate predictions.
          This will fetch today's matches from ESPN and run the prediction pipeline.
        </p>
        <button
          onClick={handleTriggerPredictions}
          disabled={triggering}
          className="trigger-btn"
        >
          {triggering ? 'Triggering...' : 'Trigger Predictions'}
        </button>
        {triggerResult && (
          <div className={`trigger-result ${triggerResult.success ? 'success' : 'error'}`}>
            <p>{triggerResult.message}</p>
            {triggerResult.matches && (
              <p className="trigger-stats">
                Matches: {triggerResult.matches.atp} ATP + {triggerResult.matches.wta} WTA
              </p>
            )}
          </div>
        )}
      </section>

      {/* Emergency: Reconcile Results */}
      <section className="admin-section emergency-section">
        <h2>Emergency: Reconcile Results</h2>
        <p className="emergency-description">
          Use this if Railway Oracle is down. This fetches completed match results
          from ESPN and updates prediction_log with actual_winner and correct fields.
        </p>
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="trigger-btn"
        >
          {reconciling ? 'Reconciling...' : 'Reconcile Results'}
        </button>
        {reconcileResult && (
          <div className={`trigger-result ${reconcileResult.success ? 'success' : 'error'}`}>
            <p>{reconcileResult.message}</p>
            {reconcileResult.details && reconcileResult.details.length > 0 && (
              <div className="reconcile-details">
                {reconcileResult.details.slice(0, 10).map((d, i) => (
                  <p key={i} className="reconcile-detail">{d}</p>
                ))}
                {reconcileResult.details.length > 10 && (
                  <p className="reconcile-detail">...and {reconcileResult.details.length - 10} more</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Test Tweet */}
      <section className="admin-section emergency-section">
        <h2>Test X (Twitter) Posting</h2>
        <p className="emergency-description">
          Send a test tweet to verify X API connectivity.
          This will post "🎾 ASHE test tweet — please ignore" to the account.
        </p>
        <button
          onClick={handleTestTweet}
          disabled={testingTweet}
          className="trigger-btn"
        >
          {testingTweet ? 'Posting...' : 'Send Test Tweet'}
        </button>
        {tweetResult && (
          <div className={`trigger-result ${tweetResult.success ? 'success' : 'error'}`}>
            <p>{tweetResult.message}</p>
            {tweetResult.tweet_url && (
              <p>
                <a href={tweetResult.tweet_url} target="_blank" rel="noopener noreferrer">
                  View tweet →
                </a>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Users Table */}
      <section className="admin-section users-section">
        <div className="users-header">
          <h2>Users ({users.length})</h2>
          <div className="users-search">
            <input
              type="text"
              placeholder="Search by email or name..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
        </div>
        {loadingUsers ? (
          <p>Loading users...</p>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Trial End</th>
                  <th>Logins</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter(u => {
                    if (!userSearch) return true
                    const search = userSearch.toLowerCase()
                    return (
                      u.email.toLowerCase().includes(search) ||
                      (u.name && u.name.toLowerCase().includes(search))
                    )
                  })
                  .map(u => (
                  <tr key={u.id} className={u.isAdmin ? 'admin-row' : ''}>
                    <td>{u.email} {u.isAdmin && <span className="admin-badge">Admin</span>}</td>
                    <td>{u.name || '-'}</td>
                    <td><span className={`tier-badge tier-${u.tier}`}>{u.tier}</span></td>
                    <td>{u.status}</td>
                    <td>{formatDate(u.trialEnd)}</td>
                    <td>{u.loginCount}</td>
                    <td>{formatDate(u.lastLogin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
