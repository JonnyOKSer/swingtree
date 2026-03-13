import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import WorldMap from '../components/WorldMap'
import './Predict.css'

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

export default function Predict() {
  const navigate = useNavigate()
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null)

  useEffect(() => {
    // Check authentication
    if (sessionStorage.getItem('ashe-authenticated') !== 'true') {
      navigate('/')
    }
  }, [navigate])

  const handleTournamentSelect = (tournament: Tournament) => {
    setSelectedTournament(tournament)
    // TODO: Navigate to draw sheet or show draw overlay
  }

  const closeDraw = () => {
    setSelectedTournament(null)
  }

  return (
    <div className="predict-page">
      <header className="predict-header">
        <Link to="/main" className="back-arrow">
          ←
        </Link>
        <h1 className="predict-title serif">ASHE</h1>
        <span className="predict-subtitle">Predict</span>
      </header>

      <WorldMap onTournamentSelect={handleTournamentSelect} />

      {/* Draw sheet overlay - placeholder for now */}
      {selectedTournament && (
        <div className="draw-overlay">
          <div className="draw-sheet">
            <div className="draw-header">
              <div className="draw-title">
                <h2>{selectedTournament.name}</h2>
                <span className="draw-meta">
                  {selectedTournament.category} • {selectedTournament.surface} • {selectedTournament.city}
                </span>
              </div>
              <button className="close-draw" onClick={closeDraw}>×</button>
            </div>
            <div className="draw-content">
              <p className="draw-placeholder">
                Draw sheet with predictions coming soon
              </p>
              <p className="draw-placeholder-sub">
                {selectedTournament.status === 'active'
                  ? `Currently in ${selectedTournament.round}`
                  : `Starts ${new Date(selectedTournament.startDate).toLocaleDateString()}`
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
