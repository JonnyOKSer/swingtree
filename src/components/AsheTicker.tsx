import { useState, useEffect, useRef, useMemo, memo } from 'react'
import './AsheTicker.css'

export interface MatchResult {
  matchKey: string
  tour: 'ATP' | 'WTA'
  round: 'R128' | 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | 'F' | 'Q'
  tournamentKey: string
  tournamentName: string
  tournamentShortName: string
  player1Name: string
  player2Name: string
  winnerName: string | null
  score: string
  isLive: boolean
  indicator: '✅' | '❌' | '🌳' | '⚡' | ''
  scheduledAt: string
  firstSet?: {
    predictedScore: string | null
    winnerWonFirstSet: boolean | null
  }
}

interface AsheTickerProps {
  matches: MatchResult[]
  tournamentKey?: string | null
  position?: 'top' | 'bottom' | 'inline'
  className?: string
}

function TickerItem({ match, showTournament }: { match: MatchResult; showTournament: boolean }) {
  const loserName = match.winnerName === match.player1Name
    ? match.player2Name
    : match.player1Name

  return (
    <div className="ticker-item">
      {showTournament && (
        <span className="ticker-tournament">{match.tournamentShortName}</span>
      )}
      <span className="ticker-tour">{match.tour}</span>
      <span className="ticker-round">{match.round}</span>

      {match.isLive && <span className="ticker-live-dot" />}

      {match.winnerName ? (
        <>
          <span className="ticker-winner">{match.winnerName}</span>
          <span className="ticker-def">def.</span>
          <span className="ticker-loser">{loserName}</span>
        </>
      ) : (
        <>
          <span className="ticker-player">{match.player1Name}</span>
          <span className="ticker-vs">vs</span>
          <span className="ticker-player">{match.player2Name}</span>
        </>
      )}

      {/* First set score display: gold if winner won FS, white with ⚡ if divergence */}
      {match.firstSet?.predictedScore ? (
        <span className={`ticker-first-set ${match.firstSet.winnerWonFirstSet ? 'winner-won-fs' : 'divergence'}`}>
          FS {match.firstSet.predictedScore}
          {match.firstSet.winnerWonFirstSet === false && <span className="fs-bolt">⚡</span>}
        </span>
      ) : (
        <span className="ticker-score">{match.score}</span>
      )}

      {match.isLive && <span className="ticker-live-tag">LIVE</span>}

      {match.indicator && (
        <span className="ticker-indicator">{match.indicator}</span>
      )}
    </div>
  )
}

function TickerHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="ticker-help-overlay" onClick={onClose}>
      <div className="ticker-help-content" onClick={e => e.stopPropagation()}>
        <button className="ticker-help-close" onClick={onClose}>×</button>
        <h3>ASHE Tracker Feed</h3>

        <div className="ticker-help-section">
          <h4>Match Format</h4>
          <p><span className="ticker-help-example">
            <span className="ticker-tour">ATP</span>
            <span className="ticker-round">R32</span>
            <span className="ticker-winner">Winner</span>
            <span className="ticker-def">def.</span>
            <span className="ticker-loser">Loser</span>
          </span></p>
        </div>

        <div className="ticker-help-section">
          <h4>Result Indicators</h4>
          <div className="ticker-help-grid">
            <div className="ticker-help-item">
              <span className="ticker-indicator">✅</span>
              <span>Correct prediction</span>
            </div>
            <div className="ticker-help-item">
              <span className="ticker-indicator">❌</span>
              <span>Incorrect prediction</span>
            </div>
            <div className="ticker-help-item">
              <span className="ticker-indicator">🌳</span>
              <span>Exact 1st set score hit</span>
            </div>
            <div className="ticker-help-item">
              <span className="ticker-indicator">⚡</span>
              <span>Divergence (1st set ≠ match)</span>
            </div>
          </div>
        </div>

        <div className="ticker-help-section">
          <h4>First Set Predictions</h4>
          <div className="ticker-help-grid">
            <div className="ticker-help-item">
              <span className="ticker-first-set winner-won-fs">FS 6-4</span>
              <span>Match winner won 1st set</span>
            </div>
            <div className="ticker-help-item">
              <span className="ticker-first-set divergence">FS 6-4<span className="fs-bolt">⚡</span></span>
              <span>Match winner lost 1st set</span>
            </div>
          </div>
        </div>

        <div className="ticker-help-section">
          <h4>Controls</h4>
          <p>Hover to pause • Click ⏸ to toggle • Click ℹ for this help</p>
        </div>
      </div>
    </div>
  )
}

function AsheTicker({
  matches,
  tournamentKey = null,
  position = 'inline',
  className = ''
}: AsheTickerProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const scrollPositionRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)

  // Filter matches based on tournamentKey
  const filteredMatches = useMemo(() => {
    if (!tournamentKey) return matches
    return matches.filter(m => m.tournamentKey === tournamentKey)
  }, [matches, tournamentKey])

  // Get label text
  const labelText = useMemo(() => {
    if (tournamentKey && filteredMatches.length > 0) {
      return filteredMatches[0].tournamentShortName
    }
    return 'Results'
  }, [tournamentKey, filteredMatches])

  // Determine if we should show tournament name in items
  const showTournament = !tournamentKey

  // Animation speed (pixels per second)
  const SCROLL_SPEED = 55

  // Animation loop using requestAnimationFrame
  useEffect(() => {
    if (filteredMatches.length === 0) return

    const animate = (currentTime: number) => {
      if (!trackRef.current) return

      // Initialize last time
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime
      }

      const deltaTime = currentTime - lastTimeRef.current
      lastTimeRef.current = currentTime

      // Only scroll if not paused and not hovered
      if (!isPaused && !isHovered) {
        scrollPositionRef.current += (SCROLL_SPEED * deltaTime) / 1000

        // Get the width of a single set of items
        const trackWidth = trackRef.current.scrollWidth / 2

        // Reset position when we've scrolled one full set
        if (scrollPositionRef.current >= trackWidth) {
          scrollPositionRef.current -= trackWidth
        }

        trackRef.current.style.transform = `translateX(-${scrollPositionRef.current}px)`
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [filteredMatches.length, isPaused, isHovered])

  // Don't render if no matches
  if (filteredMatches.length === 0) {
    return null
  }

  // Duplicate items for seamless loop
  const duplicatedMatches = [...filteredMatches, ...filteredMatches]

  const positionClass = position === 'top'
    ? 'ticker-position-top'
    : position === 'bottom'
      ? 'ticker-position-bottom'
      : ''

  return (
    <div className={`ashe-ticker ${positionClass} ${className}`}>
      {/* Left label badge */}
      <div className="ticker-label">
        <span className="ticker-label-brand">ASHE</span>
        <span className="ticker-label-sub">{labelText}</span>
      </div>

      {/* Scroll area */}
      <div
        className="ticker-scroll-area"
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="ticker-fade-left" />
        <div className="ticker-track" ref={trackRef}>
          {duplicatedMatches.map((match, index) => (
            <TickerItem
              key={`${match.matchKey}-${index}`}
              match={match}
              showTournament={showTournament}
            />
          ))}
        </div>
        <div className="ticker-fade-right" />
      </div>

      {/* Control buttons */}
      <div className="ticker-controls">
        <button
          className="ticker-help-btn"
          onClick={() => setShowHelp(true)}
          aria-label="Show ticker help"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">i</text>
          </svg>
        </button>
        <button
          className="ticker-pause-btn"
          onClick={() => setIsPaused(!isPaused)}
          aria-label={isPaused ? 'Resume ticker' : 'Pause ticker'}
        >
          {isPaused ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
        </button>
      </div>

      {/* Help overlay */}
      {showHelp && <TickerHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

export default memo(AsheTicker)
