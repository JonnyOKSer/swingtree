import { useState } from 'react'
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
  divergence: boolean // First set winner differs from match winner
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

// Mock draw data for Indian Wells (32-draw for simplicity)
const MOCK_DRAW: Match[] = [
  // Round of 32
  {
    id: 'r32-1',
    round: 'R32',
    player1: { name: 'C. Alcaraz', seed: 1, country: 'ESP' },
    player2: { name: 'Q. Halys', country: 'FRA' },
    prediction: {
      winner: 'player1',
      confidence: 'STRONG',
      winProbability: 0.89,
      firstSetWinner: 'player1',
      firstSetScore: '6-3',
      tiebreakPct: 8,
      overUnder: 'U',
      divergence: false
    },
    status: 'completed',
    result: { winner: 'player1', score: '6-3, 6-4' }
  },
  {
    id: 'r32-2',
    round: 'R32',
    player1: { name: 'T. Paul', seed: 14, country: 'USA' },
    player2: { name: 'L. Sonego', country: 'ITA' },
    prediction: {
      winner: 'player1',
      confidence: 'CONFIDENT',
      winProbability: 0.72,
      firstSetWinner: 'player2',
      firstSetScore: '7-5',
      tiebreakPct: 22,
      overUnder: 'O',
      divergence: true
    },
    status: 'completed',
    result: { winner: 'player1', score: '4-6, 6-3, 6-4' }
  },
  {
    id: 'r32-3',
    round: 'R32',
    player1: { name: 'H. Hurkacz', seed: 8, country: 'POL' },
    player2: { name: 'J. Lehecka', country: 'CZE' },
    prediction: {
      winner: 'player1',
      confidence: 'PICK',
      winProbability: 0.61,
      firstSetWinner: 'player1',
      firstSetScore: '6-4',
      tiebreakPct: 15,
      overUnder: 'U',
      divergence: false
    },
    status: 'live'
  },
  {
    id: 'r32-4',
    round: 'R32',
    player1: { name: 'A. de Minaur', seed: 9, country: 'AUS' },
    player2: { name: 'F. Cerundolo', country: 'ARG' },
    prediction: {
      winner: 'player1',
      confidence: 'CONFIDENT',
      winProbability: 0.68,
      firstSetWinner: 'player1',
      firstSetScore: '6-4',
      tiebreakPct: 12,
      overUnder: 'U',
      divergence: false
    },
    status: 'upcoming'
  },
  {
    id: 'r32-5',
    round: 'R32',
    player1: { name: 'D. Medvedev', seed: 4, country: 'RUS' },
    player2: { name: 'A. Bublik', country: 'KAZ' },
    prediction: {
      winner: 'player1',
      confidence: 'CONFIDENT',
      winProbability: 0.74,
      firstSetWinner: 'player1',
      firstSetScore: '6-3',
      tiebreakPct: 10,
      overUnder: 'U',
      divergence: false
    },
    status: 'upcoming'
  },
  {
    id: 'r32-6',
    round: 'R32',
    player1: { name: 'S. Tsitsipas', seed: 6, country: 'GRE' },
    player2: { name: 'J. Draper', country: 'GBR' },
    prediction: {
      winner: 'player2',
      confidence: 'LEAN',
      winProbability: 0.52,
      firstSetWinner: 'player2',
      firstSetScore: '7-6',
      tiebreakPct: 38,
      overUnder: 'O',
      divergence: false
    },
    status: 'upcoming'
  },
  {
    id: 'r32-7',
    round: 'R32',
    player1: { name: 'A. Rublev', seed: 5, country: 'RUS' },
    player2: { name: 'B. Shelton', country: 'USA' },
    prediction: {
      winner: 'player1',
      confidence: 'PICK',
      winProbability: 0.58,
      firstSetWinner: 'player2',
      firstSetScore: '6-4',
      tiebreakPct: 18,
      overUnder: 'O',
      divergence: true
    },
    status: 'upcoming'
  },
  {
    id: 'r32-8',
    round: 'R32',
    player1: { name: 'J. Sinner', seed: 2, country: 'ITA' },
    player2: { name: 'T. Fritz', seed: 10, country: 'USA' },
    prediction: {
      winner: 'player1',
      confidence: 'STRONG',
      winProbability: 0.82,
      firstSetWinner: 'player1',
      firstSetScore: '6-4',
      tiebreakPct: 14,
      overUnder: 'U',
      divergence: false
    },
    status: 'upcoming'
  },
  // Round of 16 (some TBD)
  {
    id: 'r16-1',
    round: 'R16',
    player1: { name: 'C. Alcaraz', seed: 1, country: 'ESP' },
    player2: { name: 'T. Paul', seed: 14, country: 'USA' },
    prediction: {
      winner: 'player1',
      confidence: 'STRONG',
      winProbability: 0.85,
      firstSetWinner: 'player1',
      firstSetScore: '6-3',
      tiebreakPct: 10,
      overUnder: 'U',
      divergence: false
    },
    status: 'upcoming'
  },
  {
    id: 'r16-2',
    round: 'R16',
    player1: null,
    player2: null,
    status: 'upcoming'
  },
  {
    id: 'r16-3',
    round: 'R16',
    player1: null,
    player2: null,
    status: 'upcoming'
  },
  {
    id: 'r16-4',
    round: 'R16',
    player1: null,
    player2: null,
    status: 'upcoming'
  },
]

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

      {result && (
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
  // Group matches by round
  const rounds = ['R32', 'R16', 'QF', 'SF', 'F']
  const matchesByRound = rounds.reduce((acc, r) => {
    acc[r] = MOCK_DRAW.filter(m => m.round === r)
    return acc
  }, {} as Record<string, Match[]>)

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
          {rounds.map(roundName => (
            <div key={roundName} className="round-column">
              <div className="round-header">{roundName}</div>
              <div className="round-matches">
                {matchesByRound[roundName]?.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
