import { useState, useEffect, useRef } from 'react'
import './DrawSheet.css'

interface MatchSlot {
  slot: number
  status: 'completed' | 'predicted' | 'known' | 'tbd' | 'void'
  player1: string
  player1_country?: string
  player1_seed?: number
  player2: string
  player2_country?: string
  player2_seed?: number
  winner?: string
  score?: string
  void_reason?: string  // For voided matches (withdrawal, walkover)
  prediction?: {
    predicted_winner: string
    confidence: number
    tier: string
    correct?: boolean
  }
  first_set?: {
    predicted_winner: string
    predicted_score: string
    tiebreak_pct: number
    over_under: string
    divergence: boolean
  }
}

interface Round {
  name: string
  display_name: string
  matches: MatchSlot[]
}

interface DrawData {
  success: boolean
  tournament: {
    id?: number
    slug: string
    name: string
    category: string
    surface: string
    city: string
    country: string
    current_round: string
    draw_size: number
  }
  rounds: Round[]
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

function MatchCard({ match }: { match: MatchSlot }) {
  const [expanded, setExpanded] = useState(false)

  const getTierClass = (tier?: string) => {
    switch (tier) {
      case 'STRONG': return 'tier-strong'
      case 'CONFIDENT': return 'tier-confident'
      case 'PICK': return 'tier-pick'
      case 'LEAN': return 'tier-lean'
      default: return ''
    }
  }

  const formatConfidence = (conf: number) => Math.round(conf * 100)

  // TBD match
  if (match.status === 'tbd') {
    return (
      <div className="match-card match-tbd">
        <div className="player-row">
          <span className="player-name muted">TBD</span>
        </div>
        <div className="vs-divider">vs</div>
        <div className="player-row">
          <span className="player-name muted">TBD</span>
        </div>
      </div>
    )
  }

  // Voided match (withdrawal, walkover)
  if (match.status === 'void') {
    return (
      <div className="match-card match-void">
        <div className="match-header">
          <span className="tier-badge tier-void">VOID</span>
        </div>
        <div className="player-row muted">
          {match.player1_seed && <span className="player-seed">{match.player1_seed}</span>}
          <span className="player-name">{match.player1}</span>
        </div>
        <div className="vs-divider">vs</div>
        <div className="player-row muted">
          {match.player2_seed && <span className="player-seed">{match.player2_seed}</span>}
          <span className="player-name">{match.player2}</span>
        </div>
        {match.void_reason && (
          <div className="void-reason">{match.void_reason}</div>
        )}
      </div>
    )
  }

  // Completed match
  if (match.status === 'completed') {
    const predCorrect = match.prediction?.correct
    return (
      <div
        className={`match-card match-completed ${match.prediction ? getTierClass(match.prediction.tier) : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="match-header">
          {match.prediction && (
            <span className={`result-badge ${predCorrect ? 'correct' : 'incorrect'}`}>
              {predCorrect ? '✓' : '✗'}
            </span>
          )}
          {match.first_set?.divergence && (
            <span className="divergence-flag" title="First set divergence">⚡</span>
          )}
        </div>
        <div className={`player-row ${match.winner === match.player1 ? 'winner' : ''}`}>
          {match.player1_seed && <span className="player-seed">{match.player1_seed}</span>}
          <span className="player-name">{match.player1}</span>
          <span className="player-country">{match.player1_country}</span>
          {match.prediction?.predicted_winner === match.player1 && (
            <span className="confidence-badge">{formatConfidence(match.prediction.confidence)}%</span>
          )}
        </div>
        <div className={`player-row ${match.winner === match.player2 ? 'winner' : ''}`}>
          {match.player2_seed && <span className="player-seed">{match.player2_seed}</span>}
          <span className="player-name">{match.player2}</span>
          <span className="player-country">{match.player2_country}</span>
          {match.prediction?.predicted_winner === match.player2 && (
            <span className="confidence-badge">{formatConfidence(match.prediction.confidence)}%</span>
          )}
        </div>
        {match.score && <div className="match-score">{match.score}</div>}

        {match.first_set && (
          <div className="first-set-line">
            <span>1st: {match.first_set.predicted_winner?.split(' ').pop()} {match.first_set.predicted_score}</span>
            <span>TB:{match.first_set.tiebreak_pct}%</span>
            <span>{match.first_set.over_under?.replace('9.5', '').trim()}</span>
          </div>
        )}
      </div>
    )
  }

  // Predicted match (not yet played)
  if (match.status === 'predicted') {
    const pred = match.prediction!
    return (
      <div
        className={`match-card match-predicted ${getTierClass(pred.tier)}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="match-header">
          <span className={`tier-badge ${getTierClass(pred.tier)}`}>{pred.tier}</span>
          {match.first_set?.divergence && (
            <span className="divergence-flag" title="First set winner differs from match winner">⚡</span>
          )}
        </div>
        <div className={`player-row ${pred.predicted_winner === match.player1 ? 'predicted-winner' : ''}`}>
          {match.player1_seed && <span className="player-seed">{match.player1_seed}</span>}
          <span className="player-name">{match.player1}</span>
          <span className="player-country">{match.player1_country}</span>
          {pred.predicted_winner === match.player1 && (
            <span className="confidence-badge">{formatConfidence(pred.confidence)}%</span>
          )}
        </div>
        <div className={`player-row ${pred.predicted_winner === match.player2 ? 'predicted-winner' : ''}`}>
          {match.player2_seed && <span className="player-seed">{match.player2_seed}</span>}
          <span className="player-name">{match.player2}</span>
          <span className="player-country">{match.player2_country}</span>
          {pred.predicted_winner === match.player2 && (
            <span className="confidence-badge">{formatConfidence(pred.confidence)}%</span>
          )}
        </div>

        {match.first_set && (
          <div className="first-set-line">
            <span>1st: {match.first_set.predicted_winner?.split(' ').pop()} {match.first_set.predicted_score}</span>
            <span>TB: {match.first_set.tiebreak_pct}%</span>
          </div>
        )}

        {expanded && match.first_set && (
          <div className="match-details">
            <div className="detail-row">
              <span className="detail-label">O/U 9.5</span>
              <span className="detail-value">{match.first_set.over_under}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Known matchup (future round, players known but no prediction)
  return (
    <div className="match-card match-known">
      <div className="player-row">
        {match.player1_seed && <span className="player-seed">{match.player1_seed}</span>}
        <span className="player-name">{match.player1}</span>
        <span className="player-country">{match.player1_country}</span>
      </div>
      <div className="vs-divider">vs</div>
      <div className="player-row">
        {match.player2_seed && <span className="player-seed">{match.player2_seed}</span>}
        <span className="player-name">{match.player2}</span>
        <span className="player-country">{match.player2_country}</span>
      </div>
    </div>
  )
}

export default function DrawSheet({
  tournamentName,
  category,
  surface,
  city,
  onClose
}: DrawSheetProps) {
  const [drawData, setDrawData] = useState<DrawData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bracketRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchDraw = async () => {
      try {
        const slug = tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '-')
        const response = await fetch(`/api/draw/${slug}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setDrawData(data)
          } else {
            setError(data.error || 'Failed to load draw')
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

  // Scroll to current round on load
  useEffect(() => {
    if (drawData && bracketRef.current) {
      // Find the current round column and scroll to it
      const currentRoundName = drawData.tournament.current_round
      const roundIndex = drawData.rounds.findIndex(r => r.display_name === currentRoundName)
      if (roundIndex > 0) {
        const columnWidth = 240 // approximate column width
        bracketRef.current.scrollLeft = Math.max(0, (roundIndex - 1) * columnWidth)
      }
    }
  }, [drawData])

  const tournamentInfo = drawData?.tournament || {
    name: tournamentName,
    category,
    surface,
    city,
    current_round: '',
    draw_size: 32
  }

  return (
    <div className="draw-overlay" onClick={onClose}>
      <div className="draw-sheet" onClick={e => e.stopPropagation()}>
        <div className="draw-header">
          <div className="draw-title">
            <h2>{tournamentInfo.name}</h2>
            <span className="draw-meta">
              {tournamentInfo.category} • {tournamentInfo.surface} • {tournamentInfo.city}
              {tournamentInfo.current_round && ` • ${tournamentInfo.current_round}`}
            </span>
          </div>
          <button className="close-draw" onClick={onClose}>×</button>
        </div>

        <div className="draw-legend">
          <div className="legend-item">
            <span className="legend-box tier-strong" />
            <span>STRONG</span>
          </div>
          <div className="legend-item">
            <span className="legend-box tier-confident" />
            <span>CONFIDENT</span>
          </div>
          <div className="legend-item">
            <span className="legend-box tier-pick" />
            <span>PICK</span>
          </div>
          <div className="legend-item">
            <span className="legend-box tier-lean" />
            <span>LEAN</span>
          </div>
          <div className="legend-item">
            <span className="divergence-icon">⚡</span>
            <span>Divergence</span>
          </div>
        </div>

        <div className="draw-bracket" ref={bracketRef}>
          {loading ? (
            <div className="draw-loading">
              <p>Loading bracket...</p>
            </div>
          ) : error ? (
            <div className="draw-error">
              <p>{error}</p>
              <p className="draw-error-sub">Check back when matches are scheduled</p>
            </div>
          ) : drawData?.rounds ? (
            <>
              {drawData.rounds.map((round, roundIndex) => (
                <div key={round.name} className="round-column">
                  <div className="round-header">{round.display_name}</div>
                  <div
                    className="round-matches"
                    style={{
                      gap: `${Math.pow(2, roundIndex) * 8}px`
                    }}
                  >
                    {round.matches.map((match) => (
                      <div key={match.slot} className="match-wrapper">
                        <MatchCard match={match} />
                        {/* Connector lines */}
                        {roundIndex < drawData.rounds.length - 1 && (
                          <div className="connector">
                            <div className="connector-line" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="draw-empty">
              <p>No bracket data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
