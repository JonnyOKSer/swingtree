import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import WorldMap, { type Tournament } from '../components/WorldMap'
import DrawSheet from '../components/DrawSheet'
import './Predict.css'

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

      {/* Draw sheet overlay */}
      {selectedTournament && (
        <DrawSheet
          tournamentName={selectedTournament.name}
          category={selectedTournament.category}
          surface={selectedTournament.surface}
          city={selectedTournament.city}
          round={selectedTournament.round}
          status={selectedTournament.status}
          onClose={closeDraw}
        />
      )}
    </div>
  )
}
