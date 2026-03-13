import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './Results.css'

interface TourResults {
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface ResultsData {
  atp: TourResults
  wta: TourResults
}

// Fallback data when API is unavailable
const FALLBACK_RESULTS: ResultsData = {
  atp: {
    match: { wins: 0, total: 0, percentage: 0 },
    firstSet: { wins: 0, total: 0, percentage: 0 }
  },
  wta: {
    match: { wins: 0, total: 0, percentage: 0 },
    firstSet: { wins: 0, total: 0, percentage: 0 }
  }
}

function ResultBox({
  label,
  wins,
  total
}: {
  label: string
  wins: number
  total: number
}) {
  const percentage = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'
  const progress = total > 0 ? (wins / total) * 100 : 0

  return (
    <div className="result-box">
      <h3 className="result-label">{label}</h3>
      <div className="result-fraction mono">
        {wins} / {total}
      </div>
      <div className="result-percentage mono">{percentage}%</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

export default function Results() {
  const isAuthenticated = sessionStorage.getItem('ashe-authenticated') === 'true'
  const [results, setResults] = useState<ResultsData>(FALLBACK_RESULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch('/api/results')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.results) {
            setResults(data.results)
          }
        }
      } catch (error) {
        console.error('Failed to fetch results:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  return (
    <div className="results-page">
      <header className="results-header">
        <h1 className="results-wordmark serif">ASHE</h1>
        <p className="results-subtitle">Track Record</p>
      </header>

      {loading ? (
        <div className="results-loading">
          <p>Loading results...</p>
        </div>
      ) : (
        <div className="results-grid">
          <ResultBox
            label="ATP MATCH"
            wins={results.atp.match.wins}
            total={results.atp.match.total}
          />
          <ResultBox
            label="ATP 1ST SET"
            wins={results.atp.firstSet.wins}
            total={results.atp.firstSet.total}
          />
          <ResultBox
            label="WTA MATCH"
            wins={results.wta.match.wins}
            total={results.wta.match.total}
          />
          <ResultBox
            label="WTA 1ST SET"
            wins={results.wta.firstSet.wins}
            total={results.wta.firstSet.total}
          />
        </div>
      )}

      <p className="results-note">
        Season-to-date results. PICK tier and above.
      </p>

      <footer className="results-footer">
        {isAuthenticated ? (
          <Link to="/main" className="back-link">
            Back to menu
          </Link>
        ) : (
          <Link to="/" className="back-link">
            Enter oracle
          </Link>
        )}
      </footer>
    </div>
  )
}
