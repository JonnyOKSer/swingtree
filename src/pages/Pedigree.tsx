import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'
import './Pedigree.css'

// Backtested performance data
const BACKTEST_STATS = {
  atp: {
    strong: 87.1,
    firstSetHitRate: 24.3
  },
  wta: {
    strong: 94.8,
    firstSetHitRate: 26.1
  }
}

function PedigreeBox({
  label,
  percentage,
  sublabel
}: {
  label: string
  percentage: number
  sublabel?: string
}) {
  return (
    <div className="pedigree-box">
      <h3 className="pedigree-label">{label}</h3>
      {sublabel && <p className="pedigree-sublabel">{sublabel}</p>}
      <div className="pedigree-percentage mono">{percentage.toFixed(1)}%</div>
      <div className="pedigree-bar">
        <div className="pedigree-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

export default function Pedigree() {
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    // Check authentication
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate])

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="pedigree-page">
        <header className="pedigree-header">
          <h1 className="pedigree-wordmark serif">ASHE</h1>
          <p className="pedigree-subtitle">Pedigree</p>
        </header>
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  return (
    <div className="pedigree-page">
      <header className="pedigree-header">
        <h1 className="pedigree-wordmark serif">ASHE</h1>
        <p className="pedigree-subtitle">Pedigree</p>
      </header>

      <div className="pedigree-grid">
        <PedigreeBox
          label="ATP STRONG"
          percentage={BACKTEST_STATS.atp.strong}
          sublabel="Match accuracy"
        />
        <PedigreeBox
          label="ATP 1ST SET"
          percentage={BACKTEST_STATS.atp.firstSetHitRate}
          sublabel="Exact score hit rate"
        />
        <PedigreeBox
          label="WTA STRONG"
          percentage={BACKTEST_STATS.wta.strong}
          sublabel="Match accuracy"
        />
        <PedigreeBox
          label="WTA 1ST SET"
          percentage={BACKTEST_STATS.wta.firstSetHitRate}
          sublabel="Exact score hit rate"
        />
      </div>

      <p className="pedigree-note">
        Backtested performance across 364,000+ matches.
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
