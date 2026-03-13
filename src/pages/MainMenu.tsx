import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './MainMenu.css'

export default function MainMenu() {
  const navigate = useNavigate()

  useEffect(() => {
    // Check authentication
    if (sessionStorage.getItem('ashe-authenticated') !== 'true') {
      navigate('/')
    }
  }, [navigate])

  const handleLogout = () => {
    sessionStorage.removeItem('ashe-authenticated')
    navigate('/')
  }

  return (
    <div className="main-menu">
      <h1 className="menu-wordmark serif">ASHE</h1>

      <nav className="menu-options">
        <Link to="/predict" className="menu-option">
          <span className="option-label">Predict</span>
          <span className="option-desc">View live predictions</span>
        </Link>

        <Link to="/results" className="menu-option">
          <span className="option-label">Results</span>
          <span className="option-desc">Track record</span>
        </Link>

        <button onClick={handleLogout} className="menu-option logout">
          <span className="option-label">Out</span>
          <span className="option-desc">Exit oracle</span>
        </button>
      </nav>
    </div>
  )
}
