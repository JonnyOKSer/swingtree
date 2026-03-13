import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Predict.css'

export default function Predict() {
  const navigate = useNavigate()

  useEffect(() => {
    // Check authentication
    if (sessionStorage.getItem('ashe-authenticated') !== 'true') {
      navigate('/')
    }
  }, [navigate])

  return (
    <div className="predict-page">
      <header className="predict-header">
        <Link to="/main" className="back-arrow">
          ←
        </Link>
        <h1 className="predict-title serif">ASHE</h1>
        <span className="predict-subtitle">Predict</span>
      </header>

      <div className="predict-placeholder">
        <p>World map coming soon</p>
        <p className="placeholder-desc">
          Interactive map showing active and upcoming ATP/WTA tournaments
        </p>
      </div>
    </div>
  )
}
