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

export default function Admin() {
  const navigate = useNavigate()
  const { user, loading, isAuthenticated } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [limits, setLimits] = useState<{ cap: number; current: number } | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    }
  }, [user])

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
        <div className="admin-stats">
          <div className="stat-box">
            <span className="stat-value">{limits.current}</span>
            <span className="stat-label">Users</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{limits.cap - limits.current}</span>
            <span className="stat-label">Spots Left</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{limits.cap}</span>
            <span className="stat-label">Total Cap</span>
          </div>
        </div>
      )}

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

      {/* Users Table */}
      <section className="admin-section users-section">
        <h2>Users ({users.length})</h2>
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
                {users.map(u => (
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
