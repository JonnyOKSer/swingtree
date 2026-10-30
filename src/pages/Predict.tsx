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

  // Open the subscription modal once the trial is known to be expired.
  //
  // This was an effect calling setShowSubscriptionModal, which cost an extra
  // render pass every time it fired. Adjusting state during render, guarded by
  // the previous values, is React's documented alternative. The guard starts
  // null so the very first render is evaluated too, matching what the effect
  // did on mount; dismissing still works, because this only reacts to a change
  // in loading/isTrialExpired.
  const [prevGate, setPrevGate] = useState<{ loading: boolean; isTrialExpired: boolean } | null>(null)
  if (!prevGate || prevGate.loading !== loading || prevGate.isTrialExpired !== isTrialExpired) {
    setPrevGate({ loading, isTrialExpired })
    if (!loading && isTrialExpired) {
      setShowSubscriptionModal(true)
    }
  }

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
