import { useState, useEffect } from 'react'
import type { Tournament } from './WorldMap'

interface TournamentListViewProps {
  tournaments: Tournament[]
  onTournamentSelect: (tournament: Tournament) => void
}

interface GroupedTournaments {
  [tour: string]: {
    [country: string]: Tournament[]
  }
}

export default function TournamentListView({ tournaments, onTournamentSelect }: TournamentListViewProps) {
  const [expandedTours, setExpandedTours] = useState<Set<string>>(new Set(['ATP', 'WTA']))
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set())

  // Group tournaments by tour, then by country
  const grouped: GroupedTournaments = tournaments.reduce((acc, tournament) => {
    // Normalize tour - split combined tours
    const tours = tournament.tour === 'ATP/WTA' ? ['ATP', 'WTA'] : [tournament.tour]

    tours.forEach(tour => {
      if (!acc[tour]) acc[tour] = {}
      if (!acc[tour][tournament.country]) acc[tour][tournament.country] = []
      // Avoid duplicates for combined tournaments
      if (!acc[tour][tournament.country].some(t => t.id === tournament.id)) {
        acc[tour][tournament.country].push(tournament)
      }
    })

    return acc
  }, {} as GroupedTournaments)

  // Sort tours (ATP first, then WTA)
  const sortedTours = Object.keys(grouped).sort((a, b) => {
    if (a === 'ATP') return -1
    if (b === 'ATP') return 1
    return a.localeCompare(b)
  })

  // Expand all countries on mount for better UX
  useEffect(() => {
    const allCountries = new Set<string>()
    Object.values(grouped).forEach(countries => {
      Object.keys(countries).forEach(country => allCountries.add(country))
    })
    setExpandedCountries(allCountries)
  }, [tournaments])

  const toggleTour = (tour: string) => {
    setExpandedTours(prev => {
      const next = new Set(prev)
      if (next.has(tour)) {
        next.delete(tour)
      } else {
        next.add(tour)
      }
      return next
    })
  }

  const toggleCountry = (country: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) {
        next.delete(country)
      } else {
        next.add(country)
      }
      return next
    })
  }

  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return 0
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const renderStatus = (tournament: Tournament) => {
    if (tournament.status === 'active') {
      return (
        <div className="tournament-status">
          <span className={`live-indicator ${tournament.tour === 'WTA' ? 'wta' : ''}`} />
          <span className={`round ${tournament.tour === 'WTA' ? 'wta' : ''}`}>{tournament.round}</span>
        </div>
      )
    } else if (tournament.status === 'completed') {
      return (
        <div className="tournament-status">
          <span className="completed-indicator">✓</span>
          <span className="round completed">{tournament.round}</span>
        </div>
      )
    } else {
      return (
        <div className="tournament-status">
          <span className="days-until">
            {tournament.startDate === null
              ? 'Upcoming'
              : daysUntil(tournament.startDate) <= 0
                ? 'Starting today'
                : `In ${daysUntil(tournament.startDate)} days`}
          </span>
        </div>
      )
    }
  }

  return (
    <div className="tournament-list-view">
      {sortedTours.map(tour => (
        <div key={tour} className="tour-section">
          <button
            className={`tour-header tour-${tour.toLowerCase()}`}
            onClick={() => toggleTour(tour)}
          >
            <span className="tour-header-content">
              <span className={`tour-badge-large tour-${tour.toLowerCase()}`}>{tour}</span>
              <span className="tour-count">
                {Object.values(grouped[tour]).reduce((sum, arr) => sum + arr.length, 0)} tournaments
              </span>
            </span>
            <span className={`chevron ${expandedTours.has(tour) ? 'expanded' : ''}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>

          {expandedTours.has(tour) && (
            <div className="tour-content">
              {Object.entries(grouped[tour])
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([country, countryTournaments]) => (
                  <div key={`${tour}-${country}`} className="country-group">
                    <button
                      className="country-header"
                      onClick={() => toggleCountry(`${tour}-${country}`)}
                    >
                      <span className="country-name">{country}</span>
                      <span className="country-count">{countryTournaments.length}</span>
                      <span className={`chevron small ${expandedCountries.has(`${tour}-${country}`) || expandedCountries.has(country) ? 'expanded' : ''}`}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </button>

                    {(expandedCountries.has(`${tour}-${country}`) || expandedCountries.has(country)) && (
                      <div className="country-tournaments">
                        {countryTournaments
                          .sort((a, b) => {
                            // Active first, then upcoming, then completed
                            const statusOrder = { active: 0, upcoming: 1, completed: 2 }
                            return statusOrder[a.status] - statusOrder[b.status]
                          })
                          .map(tournament => (
                            <div
                              key={`${tour}-${tournament.id}`}
                              className={`tournament-row ${tournament.status} tour-${tournament.tour.toLowerCase().replace('/', '-')}`}
                              onClick={() => onTournamentSelect(tournament)}
                            >
                              <div className="tournament-info">
                                <span className="tournament-name">{tournament.name}</span>
                                <span className="tournament-meta">
                                  {tournament.surface} • {tournament.category}
                                </span>
                              </div>
                              {renderStatus(tournament)}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
