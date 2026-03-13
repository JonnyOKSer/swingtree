import { useState, useEffect } from 'react'
import './DrawSheet.css'

// Confidence tiers for predictions
type ConfidenceTier = 'STRONG' | 'CONFIDENT' | 'PICK' | 'LEAN' | 'SKIP'

interface Player {
  name: string
  seed?: number
  country: string
}

interface Prediction {
  winner: 'player1' | 'player2'
  confidence: ConfidenceTier
  winProbability: number
  firstSetWinner: 'player1' | 'player2'
  firstSetScore: string
  tiebreakPct: number
  overUnder: 'O' | 'U'
  divergence: boolean
}

interface Match {
  id: string
  round: string
  player1: Player | null
  player2: Player | null
  prediction?: Prediction
  result?: {
    winner: 'player1' | 'player2'
    score: string
  }
  status: 'upcoming' | 'live' | 'completed'
}

interface DrawSheetProps {
  tournamentName: string
  category: string
  surface: string
  city: string
  round: string | null
  status: 'active' | 'upcoming'
  onClose: () => void
}

function MatchCard({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false)

  if (!match.player1 || !match.player2) {
    return (
      <div className="match-card tbd">
        <div className="match-slot">TBD</div>
        <div className="match-slot">TBD</div>
      </div>
    )
  }

  const prediction = match.prediction
  const result = match.result
  const isCorrect = result && prediction &&
    result.winner === prediction.winner

  const getConfidenceClass = (tier: ConfidenceTier) => {
    switch (tier) {
      case 'STRONG': return 'confidence-strong'
      case 'CONFIDENT': return 'confidence-confident'
      case 'PICK': return 'confidence-pick'
      case 'LEAN': return 'confidence-lean'
      case 'SKIP': return 'confidence-skip'
    }
  }

  const renderPlayer = (player: Player, position: 'player1' | 'player2') => {
    const isPredictedWinner = prediction?.winner === position
    const isActualWinner = result?.winner === position

    return (
      <div className={`player-row ${isPredictedWinner ? 'predicted-winner' : ''} ${isActualWinner ? 'actual-winner' : ''}`}>
        <span className="player-seed">{player.seed || ''}</span>
        <span className="player-name">{player.name}</span>
        <span className="player-country">{player.country}</span>
        {isPredictedWinner && prediction && (
          <span className={`prediction-badge ${getConfidenceClass(prediction.confidence)}`}>
            {Math.round(prediction.winProbability * 100)}%
          </span>
        )}
        {result && isActualWinner && (
          <span className="result-indicator">
            {isCorrect ? '✓' : ''}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`match-card ${match.status} ${prediction ? getConfidenceClass(prediction.confidence) : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="match-header">
        {match.status === 'live' && <span className="live-badge">LIVE</span>}
        {match.status === 'completed' && result && (
          <span className={`result-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
            {isCorrect ? '✓' : '✗'}
          </span>
        )}
        {prediction?.divergence && (
          <span className="divergence-flag" title="First set winner differs from match winner">⚡</span>
        )}
      </div>

      {renderPlayer(match.player1, 'player1')}
      {renderPlayer(match.player2, 'player2')}

      {result && result.score && (
        <div className="match-score">{result.score}</div>
      )}

      {expanded && prediction && (
        <div className="match-details">
          <div className="detail-row">
            <span className="detail-label">1st Set</span>
            <span className="detail-value">{prediction.firstSetScore}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">TB%</span>
            <span className="detail-value">{prediction.tiebreakPct}%</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">O/U 9.5</span>
            <span className="detail-value">{prediction.overUnder}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DrawSheet({
  tournamentName,
  category,
  surface,
  city,
  round,
  status,
  onClose
}: DrawSheetProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDraw = async () => {
      try {
        const slug = tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '-')
        const response = await fetch(`/api/draw/${slug}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.matches) {
            setMatches(data.matches)
          } else {
            setError('No predictions available for this tournament')
          }
        } else {
          setError('Failed to load draw')
        }
      } catch (err) {
        console.error('Failed to fetch draw:', err)
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }
    fetchDraw()
  }, [tournamentName])

  // Group matches by round (left to right: early rounds -> final)
  const roundOrder = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']
  const matchesByRound = roundOrder.reduce((acc, r) => {
    acc[r] = matches.filter(m => m.round === r)
    return acc
  }, {} as Record<string, Match[]>)

  // Only show rounds that have matches (already in correct left-to-right order)
  const activeRounds = roundOrder.filter(r => matchesByRound[r].length > 0)

  return (
    <div className="draw-overlay" onClick={onClose}>
      <div className="draw-sheet" onClick={e => e.stopPropagation()}>
        <div className="draw-header">
          <div className="draw-title">
            <h2>{tournamentName}</h2>
            <span className="draw-meta">
              {category} • {surface} • {city}
              {status === 'active' && round && ` • ${round}`}
            </span>
          </div>
          <button className="close-draw" onClick={onClose}>×</button>
        </div>

        <div className="draw-legend">
          <div className="legend-item">
            <span className="legend-box confidence-strong" />
            <span>STRONG</span>
          </div>
          <div className="legend-item">
            <span className="legend-box confidence-confident" />
            <span>CONFIDENT</span>
          </div>
          <div className="legend-item">
            <span className="legend-box confidence-pick" />
            <span>PICK</span>
          </div>
          <div className="legend-item">
            <span className="legend-box confidence-lean" />
            <span>LEAN</span>
          </div>
          <div className="legend-item">
            <span className="divergence-icon">⚡</span>
            <span>1st Set Divergence</span>
          </div>
        </div>

        <div className="draw-bracket">
          {loading ? (
            <div className="draw-loading">
              <p>Loading predictions...</p>
            </div>
          ) : error ? (
            <div className="draw-error">
              <p>{error}</p>
              <p className="draw-error-sub">Check back when matches are scheduled</p>
            </div>
          ) : activeRounds.length === 0 ? (
            <div className="draw-empty">
              <p>No predictions available yet</p>
              <p className="draw-empty-sub">Predictions will appear when matches are scheduled</p>
            </div>
          ) : (
            activeRounds.map(roundName => (
              <div key={roundName} className="round-column">
                <div className="round-header">{roundName}</div>
                <div className="round-matches">
                  {matchesByRound[roundName]?.map(match => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
