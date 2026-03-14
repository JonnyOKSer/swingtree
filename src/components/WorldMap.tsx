import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import './WorldMap.css'

export interface Tournament {
  id: string
  name: string
  country: string
  countryCode: string
  city: string
  surface: string
  category: string
  tour: string
  startDate: string | null
  endDate: string | null
  status: 'active' | 'upcoming'
  round: string | null
}

// Fallback mock data when API is unavailable
const FALLBACK_TOURNAMENTS: Tournament[] = [
  {
    id: 'indian-wells',
    name: 'Indian Wells',
    country: 'United States of America',
    countryCode: 'USA',
    city: 'Indian Wells',
    surface: 'Hard',
    category: 'ATP 1000',
    tour: 'ATP/WTA',
    startDate: null,
    endDate: null,
    status: 'active',
    round: 'R32'
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
  const [tournaments, setTournaments] = useState<Tournament[]>(FALLBACK_TOURNAMENTS)

  // Fetch tournaments from API
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/tournaments')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.tournaments?.length > 0) {
            setTournaments(data.tournaments)
          }
        }
      } catch (error) {
        console.error('Failed to fetch tournaments:', error)
      }
    }
    fetchTournaments()
  }, [])

  // Get countries with active or upcoming tournaments
  const activeCountries = new Set(tournaments.map(t => t.country))

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
    // Scale to show all continents without clipping
    const scale = Math.min(width / 5.5, height / 2.8)
    const projection = d3.geoNaturalEarth1()
      .scale(scale)
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
            const countryTourns = tournaments.filter(t => t.country === normalizedName)
            setCountryTournaments(countryTourns)
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
      const newScale = Math.min(newWidth / 5.5, newHeight / 2.8)

      svg.attr('width', newWidth).attr('height', newHeight)

      projection
        .scale(newScale)
        .translate([newWidth / 2, newHeight / 2])

      svg.selectAll<SVGPathElement, GeoJSON.Feature>('.country, .country-border')
        .attr('d', path as never)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeCountries, tournaments])

  const closePanel = () => {
    setSelectedCountry(null)
    setCountryTournaments([])
  }

  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return 0
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
                className={`tournament-item ${tournament.status} tour-${tournament.tour.toLowerCase().replace('/', '-')}`}
                onClick={() => onTournamentSelect(tournament)}
              >
                <div className="tournament-info">
                  <div className="tournament-name-row">
                    <span className={`tour-badge tour-${tournament.tour.toLowerCase().replace('/', '-')}`}>
                      {tournament.tour === 'ATP/WTA' ? 'ATP+WTA' : tournament.tour}
                    </span>
                    <span className="tournament-name">{tournament.name}</span>
                  </div>
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
                      {tournament.startDate === null
                        ? 'Upcoming'
                        : daysUntil(tournament.startDate) <= 0
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
