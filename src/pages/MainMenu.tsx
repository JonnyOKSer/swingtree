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
        </Link>

        <Link to="/results" className="menu-option">
          <span className="option-label">Proof</span>
        </Link>

        <Link to="/pedigree" className="menu-option">
          <span className="option-label">Pedigree</span>
        </Link>

        <button onClick={handleLogout} className="menu-option logout">
          <span className="option-label">Peace</span>
        </button>
      </nav>
    </div>
  )
}
