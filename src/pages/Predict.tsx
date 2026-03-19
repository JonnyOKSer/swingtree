import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WorldMap, { type Tournament } from '../components/WorldMap'
import DrawSheet from '../components/DrawSheet'
import SubscriptionModal from '../components/SubscriptionModal'
import Footer from '../components/Footer'
import './Predict.css'

export default function Predict() {
  const navigate = useNavigate()
  const { isAuthenticated, loading, isTrialExpired } = useAuth()
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)

  useEffect(() => {
    // Check authentication
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate])

  // Show subscription modal if trial is expired
  useEffect(() => {
    if (!loading && isTrialExpired) {
      setShowSubscriptionModal(true)
    }
  }, [loading, isTrialExpired])

  const handleTournamentSelect = (tournament: Tournament) => {
    // If trial expired, show subscription modal instead
    if (isTrialExpired) {
      setShowSubscriptionModal(true)
      return
    }
    setSelectedTournament(tournament)
  }

  const closeDraw = () => {
    setSelectedTournament(null)
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="predict-page">
        <header className="predict-header">
          <Link to="/main" className="back-arrow">
            ←
          </Link>
          <Link to="/main" className="predict-title serif">ASHE</Link>
          <span className="predict-subtitle">Predict</span>
        </header>
        <div className="predict-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="predict-page">
      <header className="predict-header">
        <Link to="/main" className="back-arrow">
          ←
        </Link>
        <Link to="/main" className="predict-title serif">ASHE</Link>
        <span className="predict-subtitle">Predict</span>
      </header>

      <WorldMap onTournamentSelect={handleTournamentSelect} />

      {/* Draw sheet overlay */}
      {selectedTournament && !showSubscriptionModal && (
        <DrawSheet
          tournamentName={selectedTournament.name}
          category={selectedTournament.category}
          surface={selectedTournament.surface}
          city={selectedTournament.city}
          round={selectedTournament.round}
          status={selectedTournament.status}
          tour={selectedTournament.tour}
          startDate={selectedTournament.startDate}
          onClose={closeDraw}
        />
      )}

      {/* Subscription modal for expired trials */}
      {showSubscriptionModal && (
        <SubscriptionModal
          reason={isTrialExpired ? 'trial_expired' : 'voluntary'}
          onClose={() => {
            setShowSubscriptionModal(false)
            if (isTrialExpired) {
              // Go back to main menu if trial expired and user closes modal
              navigate('/main')
            }
          }}
        />
      )}

      <Footer />
    </div>
  )
}
