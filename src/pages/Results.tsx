import { Link } from 'react-router-dom'
import './Results.css'

// Mock data - will come from Railway Postgres API
const mockResults = {
  atpMatch: { wins: 143, total: 168 },
  atpFirstSet: { wins: 87, total: 168 },
  wtaMatch: { wins: 98, total: 124 },
  wtaFirstSet: { wins: 62, total: 124 }
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
  const percentage = ((wins / total) * 100).toFixed(1)
  const progress = (wins / total) * 100

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

  return (
    <div className="results-page">
      <header className="results-header">
        <h1 className="results-wordmark serif">ASHE</h1>
        <p className="results-subtitle">Track Record</p>
      </header>

      <div className="results-grid">
        <ResultBox
          label="ATP MATCH"
          wins={mockResults.atpMatch.wins}
          total={mockResults.atpMatch.total}
        />
        <ResultBox
          label="ATP 1ST SET"
          wins={mockResults.atpFirstSet.wins}
          total={mockResults.atpFirstSet.total}
        />
        <ResultBox
          label="WTA MATCH"
          wins={mockResults.wtaMatch.wins}
          total={mockResults.wtaMatch.total}
        />
        <ResultBox
          label="WTA 1ST SET"
          wins={mockResults.wtaFirstSet.wins}
          total={mockResults.wtaFirstSet.total}
        />
      </div>

      <p className="results-note">
        Results include PICK tier and above predictions only.
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
