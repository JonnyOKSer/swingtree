import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'
import './Pedigree.css'

/**
 * The live track record.
 *
 * This page used to render four hard-coded numbers — ATP STRONG 87.1%, WTA
 * STRONG 94.8%, "backtested across 364,000+ matches" — that nothing computed
 * and that the prediction log did not support: ASHE has issued one STRONG
 * pick in its life and no WTA STRONG picks at all. It now reports what
 * actually happened, with the sample size under every figure, because a
 * number a subscriber can check against the draws has to be one that holds up.
 */

interface TierRow {
  tier: string
  tour: string
  total: number
  correct: number
  accuracy: number | null
  reliable: boolean
}

interface PedigreeStats {
  minSample: number
  byTier: TierRow[]
  overall: { total: number; correct: number; accuracy: number | null }
  firstSet: {
    winner: { total: number; accuracy: number | null }
    exactScore: { total: number; accuracy: number | null }
  }
  range: { first: string | null; last: string | null }
}

/** Strongest first — this is the ladder the tiers are meant to climb. */
const TIER_ORDER = ['STRONG', 'CONFIDENT', 'PICK', 'LEAN', 'SKIP']

function PedigreeBox({
  label,
  sublabel,
  accuracy,
  sample,
  reliable,
}: {
  label: string
  sublabel?: string
  accuracy: number | null
  sample: number
  reliable: boolean
}) {
  const hasFigure = accuracy !== null && reliable

  return (
    <div className="pedigree-box">
      <h3 className="pedigree-label">{label}</h3>
      {sublabel && <p className="pedigree-sublabel">{sublabel}</p>}
      <div className="pedigree-percentage mono">
        {hasFigure ? `${accuracy.toFixed(1)}%` : '—'}
      </div>
      <div className="pedigree-bar">
        <div className="pedigree-fill" style={{ width: hasFigure ? `${accuracy}%` : '0%' }} />
      </div>
      <p className="pedigree-sample mono">
        {sample === 0
          ? 'no picks yet'
          : hasFigure
            ? `${sample.toLocaleString()} picks`
            : `${sample.toLocaleString()} ${sample === 1 ? 'pick' : 'picks'} — too few to rate`}
      </p>
    </div>
  )
}

export default function Pedigree() {
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()
  const [stats, setStats] = useState<PedigreeStats | null>(null)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate])

  useEffect(() => {
    if (loading || !isAuthenticated) return
    let cancelled = false

    ;(async () => {
      try {
        const response = await fetch('/api/pedigree-stats', { credentials: 'include' })
        const data = await response.json()
        if (cancelled) return
        if (response.ok && data.success) setStats(data)
        else setError(data.error || 'Could not load the track record')
      } catch {
        if (!cancelled) setError('Could not load the track record')
      } finally {
        if (!cancelled) setFetching(false)
      }
    })()

    return () => { cancelled = true }
  }, [loading, isAuthenticated])

  const header = (
    <header className="pedigree-header">
      <Link to="/main" className="pedigree-wordmark serif">ASHE</Link>
      <p className="pedigree-subtitle">Pedigree</p>
    </header>
  )

  if (loading || fetching) {
    return (
      <div className="pedigree-page">
        {header}
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="pedigree-page">
        {header}
        <p className="pedigree-note">{error || 'No track record available yet.'}</p>
        <footer className="pedigree-footer">
          <Link to="/main" className="menu-btn">Main Menu</Link>
        </footer>
        <Footer />
      </div>
    )
  }

  // Combine the tours: a tier's accuracy is the tier's accuracy.
  const byTier = TIER_ORDER.map(tier => {
    const rows = stats.byTier.filter(r => r.tier === tier)
    const total = rows.reduce((sum, r) => sum + r.total, 0)
    const correct = rows.reduce((sum, r) => sum + r.correct, 0)
    return {
      tier,
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
      reliable: total >= stats.minSample,
    }
  }).filter(row => row.total > 0)

  return (
    <div className="pedigree-page">
      {header}

      <div className="pedigree-grid">
        {byTier.map(row => (
          <PedigreeBox
            key={row.tier}
            label={row.tier}
            sublabel="Match accuracy"
            accuracy={row.accuracy}
            sample={row.total}
            reliable={row.reliable}
          />
        ))}
        <PedigreeBox
          label="1ST SET"
          sublabel="Exact score hit rate"
          accuracy={stats.firstSet.exactScore.accuracy}
          sample={stats.firstSet.exactScore.total}
          reliable={stats.firstSet.exactScore.total >= stats.minSample}
        />
      </div>

      <p className="pedigree-note">
        Live results from {stats.overall.total.toLocaleString()} graded predictions
        {stats.range.first && stats.range.last && (
          <> between {stats.range.first} and {stats.range.last}</>
        )}
        . Voided picks — matches that never happened as drawn — are excluded.
        Tiers with fewer than {stats.minSample} graded picks are shown unrated.
      </p>

      <footer className="pedigree-footer">
        <Link to="/main" className="menu-btn">
          Main Menu
        </Link>
      </footer>

      <Footer />
    </div>
  )
}
