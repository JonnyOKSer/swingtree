import { useState, useEffect, useRef } from 'react'
import { useFeatureAccess } from './TierGate'
import AsheTicker, { type MatchResult } from './AsheTicker'
import './DrawSheet.css'

interface MatchSlot {
  slot: number
  status: 'completed' | 'predicted' | 'known' | 'tbd' | 'void' | 'bye'
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
    score_correct?: boolean  // True when predicted score matches actual
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
    tour?: string
  }
  rounds: Round[]
}

interface DrawSheetProps {
  tournamentName: string
  category: string
  surface: string
  city: string
  round: string | null
  status: 'active' | 'upcoming' | 'completed'
  tour: string
  onClose: () => void
}

// Glowing acacia tree icon - shows when first set score is exactly correct
function GlowingTree() {
  return (
    <span className="fs-correct-tree" title="First set score correct!">
      <svg viewBox="0 0 32 32" width="16" height="16">
        <g fill="#c4973b">
          <rect x="15" y="18" width="2" height="10"/>
          <ellipse cx="16" cy="14" rx="10" ry="4"/>
          <ellipse cx="16" cy="15" rx="9" ry="3"/>
          <path d="M6 14 Q8 10 16 9 Q24 10 26 14 Q24 13 16 12 Q8 13 6 14"/>
          <ellipse cx="16" cy="11" rx="7" ry="3"/>
        </g>
      </svg>
    </span>
  )
}

function MatchCard({ match }: { match: MatchSlot }) {
  const [expanded, setExpanded] = useState(false)

  // Tier-based feature access
  const canViewFirstSetWinner = useFeatureAccess('firstSetWinner')
  const canViewFirstSetScore = useFeatureAccess('firstSetScore')
  const canViewOverUnder = useFeatureAccess('overUnder')
  const canViewDivergence = useFeatureAccess('divergence')

  const getTierClass = (tier?: string) => {
    switch (tier) {
      case 'STRONG': return 'tier-strong'
      case 'CONFIDENT': return 'tier-confident'
      case 'PICK': return 'tier-pick'
      case 'LEAN': return 'tier-pick'  // Consolidated into PICK
      case 'SKIP': return 'tier-skip'
      default: return ''
    }
  }

  const getTierDisplay = (tier?: string) => {
    // Display LEAN as PICK since they're consolidated
    return tier === 'LEAN' ? 'PICK' : tier
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

  // Bye slot (seeded player advances without playing)
  if (match.status === 'bye') {
    return (
      <div className="match-card match-bye">
        <div className="player-row">
          <span className="player-name muted">Bye</span>
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
            <>
              <span className={`tier-badge ${getTierClass(match.prediction.tier)}`}>
                {getTierDisplay(match.prediction.tier)}
              </span>
              <span className={`result-badge ${predCorrect ? 'correct' : 'incorrect'}`}>
                {predCorrect ? '✓' : '✗'}
              </span>
            </>
          )}
          {canViewDivergence && match.first_set?.divergence && (
            <span className="divergence-flag" data-tooltip="First set pick differs from match winner">⚡</span>
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

        {canViewFirstSetWinner && match.first_set && (
          <div className="first-set-line">
            <span>
              1st: {match.first_set.predicted_winner?.split(' ').pop()} {canViewFirstSetScore ? match.first_set.predicted_score : ''}
            </span>
            {canViewOverUnder && <span>TB:{match.first_set.tiebreak_pct}%</span>}
            {canViewFirstSetScore && match.first_set.score_correct && <GlowingTree />}
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
          <span className={`tier-badge ${getTierClass(pred.tier)}`}>{getTierDisplay(pred.tier)}</span>
          {canViewDivergence && match.first_set?.divergence && (
            <span className="divergence-flag" data-tooltip="First set pick differs from match winner">⚡</span>
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

        {canViewFirstSetWinner && match.first_set && (
          <div className="first-set-line">
            <span>1st: {match.first_set.predicted_winner?.split(' ').pop()} {canViewFirstSetScore ? match.first_set.predicted_score : ''}</span>
            {canViewOverUnder && <span>TB: {match.first_set.tiebreak_pct}%</span>}
          </div>
        )}

        {expanded && canViewOverUnder && match.first_set && (
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
  tour,
  onClose
}: DrawSheetProps) {
  const [drawData, setDrawData] = useState<DrawData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tickerMatches, setTickerMatches] = useState<MatchResult[]>([])
  const bracketRef = useRef<HTMLDivElement>(null)

  // Tier-based access for legend
  const canViewDivergence = useFeatureAccess('divergence')

  // Fetch ticker data filtered to this tournament
  useEffect(() => {
    const fetchTickerData = async () => {
      try {
        const response = await fetch('/api/ticker')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.matches) {
            // Filter to this tournament by name
            const filtered = data.matches.filter((m: MatchResult) =>
              m.tournamentName.toLowerCase().includes(tournamentName.toLowerCase()) ||
              tournamentName.toLowerCase().includes(m.tournamentShortName.toLowerCase())
            )
            setTickerMatches(filtered)
          }
        }
      } catch (error) {
        console.error('Failed to fetch ticker data:', error)
      }
    }

    fetchTickerData()
    const interval = setInterval(fetchTickerData, 120000)
    return () => clearInterval(interval)
  }, [tournamentName])

  useEffect(() => {
    const fetchDraw = async () => {
      try {
        // Include tour in slug for proper filtering (e.g., "indian-wells-wta")
        const baseSlug = tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '-')
        const tourSuffix = tour && tour !== 'ATP/WTA' ? `-${tour.toLowerCase()}` : ''
        const slug = `${baseSlug}${tourSuffix}`
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
  }, [tournamentName, tour])

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
    draw_size: 32,
    tour
  }

  // Get tour badge class
  const tourClass = (tournamentInfo.tour || tour || 'ATP').toLowerCase().replace('/', '-')

  return (
    <div className="draw-overlay" onClick={onClose}>
      <div className="draw-sheet" onClick={e => e.stopPropagation()}>
        <div className="draw-header">
          <div className="draw-title">
            <div className="draw-title-row">
              <span className={`draw-tour-badge tour-${tourClass}`}>
                {tournamentInfo.tour || tour}
              </span>
              <h2>{tournamentInfo.name}</h2>
            </div>
            <span className="draw-meta">
              {tournamentInfo.category} • {tournamentInfo.surface} • {tournamentInfo.city}
              {tournamentInfo.current_round && ` • ${tournamentInfo.current_round}`}
            </span>
          </div>
          <button className="close-draw" onClick={onClose}>×</button>
        </div>

        {tickerMatches.length > 0 && (
          <AsheTicker
            matches={tickerMatches}
            tournamentKey={drawData?.tournament?.id?.toString() || null}
            position="inline"
          />
        )}

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
            <span className="legend-box tier-skip" />
            <span>SKIP</span>
          </div>
          {canViewDivergence && (
            <div className="legend-item legend-tooltip" data-tooltip="Predicted winner will lose first set">
              <span className="divergence-icon">⚡</span>
              <span>Divergence</span>
            </div>
          )}
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
