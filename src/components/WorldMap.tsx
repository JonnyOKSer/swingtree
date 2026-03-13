import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import './WorldMap.css'

interface Tournament {
  id: number
  name: string
  country: string
  countryCode: string
  city: string
  surface: string
  category: string
  tour: string
  startDate: string
  endDate: string
  status: 'active' | 'upcoming'
  round: string | null
}

// Mock tournament data - will come from API
const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: 1,
    name: 'Australian Open',
    country: 'Australia',
    countryCode: 'AUS',
    city: 'Melbourne',
    surface: 'Hard',
    category: 'Grand Slam',
    tour: 'ATP/WTA',
    startDate: '2026-01-19',
    endDate: '2026-02-01',
    status: 'upcoming',
    round: null
  },
  {
    id: 2,
    name: 'Qatar Open',
    country: 'Qatar',
    countryCode: 'QAT',
    city: 'Doha',
    surface: 'Hard',
    category: 'ATP 250',
    tour: 'ATP',
    startDate: '2026-03-10',
    endDate: '2026-03-16',
    status: 'active',
    round: 'R16'
  },
  {
    id: 3,
    name: 'Indian Wells',
    country: 'United States of America',
    countryCode: 'USA',
    city: 'Indian Wells',
    surface: 'Hard',
    category: 'ATP 1000',
    tour: 'ATP/WTA',
    startDate: '2026-03-12',
    endDate: '2026-03-23',
    status: 'active',
    round: 'R32'
  },
  {
    id: 4,
    name: 'Dubai Championships',
    country: 'United Arab Emirates',
    countryCode: 'ARE',
    city: 'Dubai',
    surface: 'Hard',
    category: 'WTA 1000',
    tour: 'WTA',
    startDate: '2026-03-15',
    endDate: '2026-03-22',
    status: 'upcoming',
    round: null
  },
  {
    id: 5,
    name: 'Monte-Carlo Masters',
    country: 'Monaco',
    countryCode: 'MCO',
    city: 'Monte Carlo',
    surface: 'Clay',
    category: 'ATP 1000',
    tour: 'ATP',
    startDate: '2026-03-18',
    endDate: '2026-03-25',
    status: 'upcoming',
    round: null
  },
  {
    id: 6,
    name: 'Miami Open',
    country: 'United States of America',
    countryCode: 'USA',
    city: 'Miami',
    surface: 'Hard',
    category: 'ATP 1000',
    tour: 'ATP/WTA',
    startDate: '2026-03-24',
    endDate: '2026-04-06',
    status: 'upcoming',
    round: null
  }
]

// Country name mapping for matching TopoJSON names to our data
const COUNTRY_NAME_MAP: Record<string, string> = {
  'United States': 'United States of America',
  'USA': 'United States of America',
  'UAE': 'United Arab Emirates',
}

interface WorldMapProps {
  onTournamentSelect: (tournament: Tournament) => void
}

export default function WorldMap({ onTournamentSelect }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [countryTournaments, setCountryTournaments] = useState<Tournament[]>([])
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })

  // Get countries with active or upcoming tournaments
  const activeCountries = new Set(MOCK_TOURNAMENTS.map(t => t.country))

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    // Clear previous content
    svg.selectAll('*').remove()

    // Create projection - Natural Earth for a pleasing look
    const projection = d3.geoNaturalEarth1()
      .scale(width / 5.5)
      .translate([width / 2, height / 2])

    const path = d3.geoPath().projection(projection)

    // Load world topology
    const worldUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

    d3.json<Topology<{ countries: GeometryCollection }>>(worldUrl).then((topology) => {
      if (!topology) return

      const countries = topojson.feature(
        topology,
        topology.objects.countries as GeometryCollection
      )

      // Draw countries
      svg.append('g')
        .selectAll('path')
        .data((countries as GeoJSON.FeatureCollection).features)
        .enter()
        .append('path')
        .attr('d', path as never)
        .attr('class', (d) => {
          const name = (d.properties as { name: string })?.name || ''
          const normalizedName = COUNTRY_NAME_MAP[name] || name
          const isActive = activeCountries.has(normalizedName)
          return `country ${isActive ? 'active' : 'inactive'}`
        })
        .attr('data-name', (d) => (d.properties as { name: string })?.name || '')
        .on('click', function(event, d) {
          const name = (d.properties as { name: string })?.name || ''
          const normalizedName = COUNTRY_NAME_MAP[name] || name

          if (activeCountries.has(normalizedName)) {
            const tournaments = MOCK_TOURNAMENTS.filter(t => t.country === normalizedName)
            setCountryTournaments(tournaments)
            setSelectedCountry(normalizedName)

            // Position panel near click
            const [x, y] = d3.pointer(event, container)
            setPanelPosition({
              x: Math.min(x, width - 320),
              y: Math.min(y, height - 200)
            })
          } else {
            setSelectedCountry(null)
            setCountryTournaments([])
          }
        })
        .on('mouseenter', function(_, d) {
          const name = (d.properties as { name: string })?.name || ''
          const normalizedName = COUNTRY_NAME_MAP[name] || name
          if (activeCountries.has(normalizedName)) {
            d3.select(this).classed('hovered', true)
          }
        })
        .on('mouseleave', function() {
          d3.select(this).classed('hovered', false)
        })

      // Draw country borders
      svg.append('path')
        .datum(topojson.mesh(topology, topology.objects.countries as GeometryCollection, (a, b) => a !== b))
        .attr('class', 'country-border')
        .attr('d', path as never)
    })

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return
      const newWidth = containerRef.current.clientWidth
      const newHeight = containerRef.current.clientHeight

      svg.attr('width', newWidth).attr('height', newHeight)

      projection
        .scale(newWidth / 5.5)
        .translate([newWidth / 2, newHeight / 2])

      svg.selectAll<SVGPathElement, GeoJSON.Feature>('.country, .country-border')
        .attr('d', path as never)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeCountries])

  const closePanel = () => {
    setSelectedCountry(null)
    setCountryTournaments([])
  }

  const daysUntil = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="world-map-container" ref={containerRef}>
      <svg ref={svgRef} className="world-map" />

      {/* Tournament panel */}
      {selectedCountry && countryTournaments.length > 0 && (
        <div
          className="tournament-panel"
          style={{ left: panelPosition.x, top: panelPosition.y }}
        >
          <div className="panel-header">
            <h3>{selectedCountry}</h3>
            <button className="close-btn" onClick={closePanel}>×</button>
          </div>
          <div className="tournament-list">
            {countryTournaments.map((tournament) => (
              <div
                key={tournament.id}
                className={`tournament-item ${tournament.status}`}
                onClick={() => onTournamentSelect(tournament)}
              >
                <div className="tournament-info">
                  <span className="tournament-name">{tournament.name}</span>
                  <span className="tournament-meta">
                    {tournament.category} • {tournament.surface}
                  </span>
                </div>
                <div className="tournament-status">
                  {tournament.status === 'active' ? (
                    <>
                      <span className="live-indicator" />
                      <span className="round">{tournament.round}</span>
                    </>
                  ) : (
                    <span className="days-until">
                      {daysUntil(tournament.startDate) <= 0
                        ? 'Starting today'
                        : `In ${daysUntil(tournament.startDate)} days`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-dot active" />
          <span>Active / Upcoming</span>
        </div>
      </div>
    </div>
  )
}
