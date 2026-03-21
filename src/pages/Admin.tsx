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

interface WageringInsight {
  id: string
  timestamp: string
  tournament: string | null
  tour: string | null
  type: 'parlay' | 'single' | 'round_pattern' | 'tier_pattern' | 'tour_pattern'
  predictionType: string
  description: string
  winRate: number
  sampleSize: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface ModelStats {
  modelName: string
  modelVersion: string
  totalPredictions: number
  fsWinner: { total: number; correct: number; accuracy: number }
  fsScore: { total: number; correct: number; accuracy: number }
  fsOverUnder: { total: number; correct: number; accuracy: number }
  byScoreCategory: { [score: string]: { predicted: number; correct: number; accuracy: number } }
  calibration: Array<{ bucket: number; predictedProb: number; actualProb: number; count: number }>
  isProduction: boolean
}

interface ModelComparisonData {
  stats: ModelStats[]
  summary: {
    totalMatches: number
    dateRange: { start: string; end: string }
  }
}

interface RoundPattern {
  round: string
  tour?: string
  matchWinner: number | null
  firstSetWinner: number | null
  firstSetScore: number | null
  total: number
}

interface TierPattern {
  tier: string
  tour?: string
  matchWinRate: number
  fsWinnerRate: number
  fsScoreRate: number
  total: number
}

interface TourSummary {
  tour: string
  total: number
  matchWinRate: number
  fsWinnerRate: number
  fsScoreRate: number
}

interface WageringAnalysis {
  generatedAt: string
  totalPredictions: number
  dateRange: { start: string; end: string } | null
  insights: WageringInsight[]
  roundPatterns: RoundPattern[]
  tierPatterns: TierPattern[]
  tourSummary: TourSummary[]
  roundPatternsByTour: { [tour: string]: RoundPattern[] }
  tierPatternsByTour: { [tour: string]: TierPattern[] }
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

  // Wagering strategies
  const [wageringInsights, setWageringInsights] = useState<WageringAnalysis | null>(null)
  const [loadingWagering, setLoadingWagering] = useState(false)

  // Model comparison
  const [modelComparison, setModelComparison] = useState<ModelComparisonData | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelDays, setModelDays] = useState(30)
  const [modelTour, setModelTour] = useState<string>('')

  // Draw sync status
  const [drawSyncStatus, setDrawSyncStatus] = useState<{
    recent_syncs: Array<{
      id: number
      synced_at: string
      source: string
      matches_synced: number
      success: boolean
      errors: string[] | null
    }>
    last_successful: string | null
    draw_matches_count: number
    active_tournaments: number
    status: 'healthy' | 'stale' | 'error'
  } | null>(null)
  const [syncingDraw, setSyncingDraw] = useState(false)
  const [drawSyncResult, setDrawSyncResult] = useState<{
    success: boolean
    message: string
    matches_synced?: number
  } | null>(null)

  // Cron status
  const [cronStatus, setCronStatus] = useState<{
    today: string
    predictions_today: number
    unreconciled_3d: number
    status: string
    last_successful_runs: Record<string, string>
    recent_runs: Array<{
      cron: string
      ran_at: string
      success: boolean
      error: string | null
    }>
  } | null>(null)

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
      fetchDrawSyncStatus()
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

      // Also fetch cron status
      if (response.ok) {
        fetchCronStatus()
      }
    } catch {
      setSystemHealth({ railway: 'offline' })
    }
  }

  const fetchCronStatus = async () => {
    try {
      const response = await fetch('https://agent-production-765b.up.railway.app/cron/status')
      if (response.ok) {
        const data = await response.json()
        setCronStatus(data)
      }
    } catch {
      console.error('Failed to fetch cron status')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchUsers(), checkSystemHealth(), fetchAccuracyStats(), fetchDrawSyncStatus()])
    setRefreshing(false)
  }

  const fetchDrawSyncStatus = async () => {
    try {
      const response = await fetch('/api/admin-draw-sync', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDrawSyncStatus({
            recent_syncs: data.recent_syncs || [],
            last_successful: data.last_successful,
            draw_matches_count: data.draw_matches_count,
            active_tournaments: data.active_tournaments,
            status: data.status
          })
        }
      }
    } catch {
      console.error('Failed to fetch draw sync status')
    }
  }

  const handleTriggerDrawSync = async () => {
    if (!confirm('This will manually sync draw_matches from ESPN. Continue?')) return

    setSyncingDraw(true)
    setDrawSyncResult(null)

    try {
      const response = await fetch('/api/admin-draw-sync', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok) {
        setDrawSyncResult({
          success: data.success,
          message: data.message || 'Sync complete',
          matches_synced: data.matches_synced
        })
        // Refresh status
        fetchDrawSyncStatus()
      } else {
        setDrawSyncResult({
          success: false,
          message: data.error || 'Sync failed'
        })
      }
    } catch {
      setDrawSyncResult({
        success: false,
        message: 'Network error'
      })
    } finally {
      setSyncingDraw(false)
    }
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

  const fetchWageringInsights = async () => {
    setLoadingWagering(true)
    try {
      const response = await fetch('/api/wagering-strategies?days=30')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setWageringInsights(data.analysis)
        }
      }
    } catch {
      console.error('Failed to fetch wagering insights')
    } finally {
      setLoadingWagering(false)
    }
  }

  const fetchModelComparison = async () => {
    setLoadingModels(true)
    try {
      const params = new URLSearchParams({ days: modelDays.toString() })
      if (modelTour) params.append('tour', modelTour)
      const response = await fetch(`/api/model-comparison?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setModelComparison({ stats: data.stats, summary: data.summary })
        }
      }
    } catch {
      console.error('Failed to fetch model comparison')
    } finally {
      setLoadingModels(false)
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

      {/* Model Comparison Section */}
      <section className="admin-section model-comparison-section">
        <div className="accuracy-header">
          <h2>First Set Model Comparison</h2>
          <div className="model-filters">
            <select
              value={modelDays}
              onChange={e => setModelDays(parseInt(e.target.value))}
              className="model-filter-select"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <select
              value={modelTour}
              onChange={e => setModelTour(e.target.value)}
              className="model-filter-select"
            >
              <option value="">All Tours</option>
              <option value="ATP">ATP</option>
              <option value="WTA">WTA</option>
            </select>
            <button
              className="refresh-btn small"
              onClick={fetchModelComparison}
              disabled={loadingModels}
              title="Refresh model comparison"
            >
              {loadingModels ? '↻' : '⟳'}
            </button>
          </div>
        </div>

        {modelComparison?.summary && (
          <p className="model-summary">
            {modelComparison.summary.totalMatches} matches from {modelComparison.summary.dateRange.start} to {modelComparison.summary.dateRange.end}
          </p>
        )}

        {loadingModels && !modelComparison ? (
          <p>Loading model comparison...</p>
        ) : modelComparison?.stats?.length ? (
          <div className="model-comparison-content">
            {/* Model Summary Cards */}
            <div className="model-cards">
              {modelComparison.stats.map(model => (
                <div
                  key={model.modelName}
                  className={`model-card ${model.isProduction ? 'production' : ''}`}
                >
                  <div className="model-card-header">
                    <span className="model-name">{model.modelName}</span>
                    {model.isProduction && <span className="production-badge">PRODUCTION</span>}
                  </div>
                  <div className="model-card-stats">
                    <div className="model-stat">
                      <span className="model-stat-label">FS Winner</span>
                      <span className="model-stat-value">{model.fsWinner.accuracy}%</span>
                      <span className="model-stat-detail">{model.fsWinner.correct}/{model.fsWinner.total}</span>
                    </div>
                    <div className="model-stat">
                      <span className="model-stat-label">FS Score</span>
                      <span className="model-stat-value">{model.fsScore.accuracy}%</span>
                      <span className="model-stat-detail">{model.fsScore.correct}/{model.fsScore.total}</span>
                    </div>
                    <div className="model-stat">
                      <span className="model-stat-label">O/U 9.5</span>
                      <span className="model-stat-value">{model.fsOverUnder.accuracy}%</span>
                      <span className="model-stat-detail">{model.fsOverUnder.correct}/{model.fsOverUnder.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Score Category Comparison Table */}
            <div className="score-category-table-wrapper">
              <h3>Score Category Accuracy</h3>
              <table className="accuracy-table score-category-table">
                <thead>
                  <tr>
                    <th>Score</th>
                    {modelComparison.stats.map(m => (
                      <th key={m.modelName}>{m.modelName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {['6-0', '6-1', '6-2', '6-3', '6-4', '7-5', '7-6'].map(score => (
                    <tr key={score}>
                      <td className="score-label">{score}</td>
                      {modelComparison.stats.map(m => {
                        const cat = m.byScoreCategory[score]
                        return (
                          <td key={m.modelName} className="score-cell">
                            {cat ? (
                              <>
                                <span className="score-accuracy">{cat.accuracy}%</span>
                                <span className="score-detail">({cat.correct}/{cat.predicted})</span>
                              </>
                            ) : (
                              <span className="no-data">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="no-model-data">No model comparison data available. Models need reconciled predictions to compare.</p>
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

      {/* Wagering Strategy Insights */}
      <section className="admin-section wagering-section">
        <div className="wagering-header">
          <h2>Wagering Strategy Insights</h2>
          <button
            className="trigger-btn"
            onClick={fetchWageringInsights}
            disabled={loadingWagering}
          >
            {loadingWagering ? 'Generating...' : 'Generate Insights'}
          </button>
        </div>

        {wageringInsights && (
          <div className="wagering-content">
            <p className="wagering-meta">
              Generated: {new Date(wageringInsights.generatedAt).toLocaleString()} •
              {wageringInsights.totalPredictions} predictions analyzed
              {wageringInsights.dateRange && (
                <> • {new Date(wageringInsights.dateRange.start).toLocaleDateString()} - {new Date(wageringInsights.dateRange.end).toLocaleDateString()}</>
              )}
            </p>

            {/* Tour Summary */}
            {wageringInsights.tourSummary && wageringInsights.tourSummary.length > 0 && (
              <div className="tour-summary">
                <h3>Tour Summary</h3>
                <div className="tour-cards">
                  {wageringInsights.tourSummary.map(ts => (
                    <div key={ts.tour} className={`tour-card tour-${ts.tour.toLowerCase()}`}>
                      <span className="tour-name">{ts.tour}</span>
                      <div className="tour-stats">
                        <div className="tour-stat">
                          <span className="stat-value">{(ts.matchWinRate * 100).toFixed(1)}%</span>
                          <span className="stat-label">Match</span>
                        </div>
                        <div className="tour-stat">
                          <span className="stat-value">{(ts.fsWinnerRate * 100).toFixed(1)}%</span>
                          <span className="stat-label">FS Win</span>
                        </div>
                        <div className="tour-stat">
                          <span className="stat-value">{(ts.fsScoreRate * 100).toFixed(1)}%</span>
                          <span className="stat-label">FS Score</span>
                        </div>
                        <div className="tour-stat">
                          <span className="stat-value">{ts.total}</span>
                          <span className="stat-label">n</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insights Feed */}
            {wageringInsights.insights.length > 0 && (
              <div className="insights-feed">
                <h3>Top Insights</h3>
                {wageringInsights.insights.slice(0, 15).map(insight => (
                  <div key={insight.id} className={`insight-item ${insight.type} ${insight.confidence.toLowerCase()}`}>
                    <div className="insight-header">
                      <span className={`insight-type ${insight.type}`}>
                        {insight.type === 'round_pattern' ? '📊' :
                         insight.type === 'tier_pattern' ? '🎯' :
                         insight.type === 'tour_pattern' ? '🎾' :
                         insight.type === 'parlay' ? '🔗' : '📈'}
                        {insight.type.replace('_', ' ')}
                      </span>
                      {insight.tour && (
                        <span className={`insight-tour tour-${insight.tour.toLowerCase()}`}>{insight.tour}</span>
                      )}
                      <span className={`insight-confidence ${insight.confidence.toLowerCase()}`}>
                        {insight.confidence}
                      </span>
                    </div>
                    <p className="insight-description">{insight.description}</p>
                    <div className="insight-meta">
                      <span className="insight-rate">{(insight.winRate * 100).toFixed(1)}%</span>
                      <span className="insight-sample">n={insight.sampleSize}</span>
                      {insight.tournament && (
                        <span className="insight-tournament">{insight.tournament}</span>
                      )}
                      {insight.timestamp && (
                        <span className="insight-time">{new Date(insight.timestamp).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Round Patterns Table */}
            {wageringInsights.roundPatterns.length > 0 && (
              <div className="round-patterns">
                <h3>Accuracy by Round</h3>
                <table className="patterns-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Match</th>
                      <th>FS Winner</th>
                      <th>FS Score</th>
                      <th>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wageringInsights.roundPatterns.map(rp => (
                      <tr key={rp.round}>
                        <td>{rp.round}</td>
                        <td>{rp.matchWinner !== null ? `${(rp.matchWinner * 100).toFixed(1)}%` : '-'}</td>
                        <td>{rp.firstSetWinner !== null ? `${(rp.firstSetWinner * 100).toFixed(1)}%` : '-'}</td>
                        <td>{rp.firstSetScore !== null ? `${(rp.firstSetScore * 100).toFixed(1)}%` : '-'}</td>
                        <td>{rp.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tier Patterns Table */}
            {wageringInsights.tierPatterns.length > 0 && (
              <div className="tier-patterns">
                <h3>Accuracy by Tier (Overall)</h3>
                <table className="patterns-table">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Match</th>
                      <th>FS Winner</th>
                      <th>FS Score</th>
                      <th>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wageringInsights.tierPatterns.map(tp => (
                      <tr key={tp.tier} className={`tier-row tier-${tp.tier.toLowerCase()}`}>
                        <td><span className={`tier-badge tier-${tp.tier.toLowerCase()}`}>{tp.tier}</span></td>
                        <td>{(tp.matchWinRate * 100).toFixed(1)}%</td>
                        <td>{(tp.fsWinnerRate * 100).toFixed(1)}%</td>
                        <td>{(tp.fsScoreRate * 100).toFixed(1)}%</td>
                        <td>{tp.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tour-Specific Tables */}
            {wageringInsights.roundPatternsByTour && Object.keys(wageringInsights.roundPatternsByTour).length > 0 && (
              <div className="tour-breakdown">
                <h3>By Tour</h3>
                <div className="tour-tables">
                  {Object.entries(wageringInsights.roundPatternsByTour).map(([tour, roundPatterns]) => (
                    <div key={tour} className={`tour-table-section tour-${tour.toLowerCase()}`}>
                      <h4 className="tour-table-header">{tour}</h4>

                      {/* Round patterns for this tour */}
                      <table className="patterns-table compact">
                        <thead>
                          <tr>
                            <th>Round</th>
                            <th>Match</th>
                            <th>FS Score</th>
                            <th>n</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roundPatterns.map(rp => (
                            <tr key={`${tour}-${rp.round}`}>
                              <td>{rp.round}</td>
                              <td>{rp.matchWinner !== null ? `${(rp.matchWinner * 100).toFixed(1)}%` : '-'}</td>
                              <td>{rp.firstSetScore !== null ? `${(rp.firstSetScore * 100).toFixed(1)}%` : '-'}</td>
                              <td>{rp.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Tier patterns for this tour */}
                      {wageringInsights.tierPatternsByTour && wageringInsights.tierPatternsByTour[tour] && (
                        <table className="patterns-table compact tier-table">
                          <thead>
                            <tr>
                              <th>Tier</th>
                              <th>Match</th>
                              <th>FS Score</th>
                              <th>n</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wageringInsights.tierPatternsByTour[tour].map(tp => (
                              <tr key={`${tour}-${tp.tier}`} className={`tier-row tier-${tp.tier.toLowerCase()}`}>
                                <td><span className={`tier-badge tier-${tp.tier.toLowerCase()}`}>{tp.tier}</span></td>
                                <td>{(tp.matchWinRate * 100).toFixed(1)}%</td>
                                <td>{(tp.fsScoreRate * 100).toFixed(1)}%</td>
                                <td>{tp.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wageringInsights.insights.length === 0 && (
              <p className="no-insights">No significant patterns found. Need more reconciled predictions.</p>
            )}
          </div>
        )}
      </section>

      {/* Draw Sync Status */}
      <section className="admin-section draw-sync-section">
        <div className="draw-sync-header">
          <h2>Draw Sync (ESPN)</h2>
          <div className="draw-sync-actions">
            <button
              className="refresh-btn small"
              onClick={fetchDrawSyncStatus}
              title="Refresh status"
            >
              ⟳
            </button>
            <button
              className="trigger-btn small"
              onClick={handleTriggerDrawSync}
              disabled={syncingDraw}
            >
              {syncingDraw ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {drawSyncResult && (
          <div className={`trigger-result ${drawSyncResult.success ? 'success' : 'error'}`}>
            <p>{drawSyncResult.message}</p>
            {drawSyncResult.matches_synced !== undefined && (
              <p className="sync-count">Matches synced: {drawSyncResult.matches_synced}</p>
            )}
          </div>
        )}

        {drawSyncStatus ? (
          <div className="draw-sync-content">
            <div className="draw-sync-summary">
              <div className={`draw-sync-status-badge ${drawSyncStatus.status}`}>
                {drawSyncStatus.status === 'healthy' ? '✓ Healthy' :
                 drawSyncStatus.status === 'stale' ? '⚠ Stale' : '✗ Error'}
              </div>
              <div className="draw-sync-stats">
                <span>Draw Matches: <strong>{drawSyncStatus.draw_matches_count}</strong></span>
                <span>Active Tournaments: <strong>{drawSyncStatus.active_tournaments}</strong></span>
                {drawSyncStatus.last_successful && (
                  <span>Last Sync: <strong>{new Date(drawSyncStatus.last_successful).toLocaleString()}</strong></span>
                )}
              </div>
            </div>

            {drawSyncStatus.recent_syncs && drawSyncStatus.recent_syncs.length > 0 && (
              <div className="draw-sync-recent">
                <h4>Recent Syncs</h4>
                <table className="draw-sync-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Matches</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drawSyncStatus.recent_syncs.slice(0, 5).map((sync) => (
                      <tr key={sync.id} className={sync.success ? 'success' : 'failed'}>
                        <td>{new Date(sync.synced_at).toLocaleString()}</td>
                        <td>{sync.source}</td>
                        <td>{sync.matches_synced}</td>
                        <td>
                          {sync.success ? '✓' : '✗'}
                          {sync.errors && sync.errors.length > 0 && (
                            <span className="sync-error-count" title={sync.errors.join(', ')}>
                              ({sync.errors.length} errors)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {drawSyncStatus.status === 'error' && drawSyncStatus.active_tournaments > 0 && (
              <div className="draw-sync-alert">
                ⚠️ Draw matches empty but {drawSyncStatus.active_tournaments} tournament(s) active.
                Drawsheet will show empty until sync succeeds.
              </div>
            )}
          </div>
        ) : (
          <p className="draw-sync-loading">Loading draw sync status...</p>
        )}
      </section>

      {/* Cron Status */}
      <section className="admin-section cron-section">
        <div className="cron-header">
          <h2>Cron Jobs</h2>
          <button
            className="refresh-btn small"
            onClick={fetchCronStatus}
            title="Refresh cron status"
          >
            ⟳
          </button>
        </div>

        {cronStatus ? (
          <div className="cron-content">
            <div className="cron-summary">
              <div className={`cron-status-badge ${cronStatus.status}`}>
                {cronStatus.status === 'healthy' ? '✓ Healthy' : '⚠ Needs Attention'}
              </div>
              <div className="cron-stats">
                <span>Predictions Today: <strong>{cronStatus.predictions_today}</strong></span>
                <span>Unreconciled (3d): <strong>{cronStatus.unreconciled_3d}</strong></span>
              </div>
            </div>

            {cronStatus.last_successful_runs && Object.keys(cronStatus.last_successful_runs).length > 0 && (
              <div className="cron-last-runs">
                <h4>Last Successful Runs</h4>
                <div className="last-runs-grid">
                  {Object.entries(cronStatus.last_successful_runs).map(([cron, time]) => (
                    <div key={cron} className="last-run-item">
                      <span className="cron-name">{cron}</span>
                      <span className="cron-time">{time ? new Date(time).toLocaleString() : 'Never'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cronStatus.recent_runs && cronStatus.recent_runs.length > 0 && (
              <div className="cron-recent">
                <h4>Recent Runs</h4>
                <table className="cron-table">
                  <thead>
                    <tr>
                      <th>Cron</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronStatus.recent_runs.slice(0, 10).map((run, i) => (
                      <tr key={i} className={run.success ? 'success' : 'failed'}>
                        <td>{run.cron}</td>
                        <td>{new Date(run.ran_at).toLocaleString()}</td>
                        <td>{run.success ? '✓' : '✗'}</td>
                        <td className="error-cell">{run.error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="cron-loading">Loading cron status... (requires Railway deployment)</p>
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
