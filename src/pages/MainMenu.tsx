import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'
import './MainMenu.css'

export default function MainMenu() {
  const navigate = useNavigate()
  const { isAuthenticated, loading, logout, user } = useAuth()

  useEffect(() => {
    // Check authentication
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate])

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="main-menu">
        <h1 className="menu-wordmark serif">ASHE</h1>
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  return (
    <div className="main-menu">
      <h1 className="menu-wordmark serif">ASHE</h1>

      {user && (
        <p className="user-email mono">{user.email}</p>
      )}

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

        <button onClick={logout} className="menu-option logout">
          <span className="option-label">Peace</span>
        </button>
      </nav>

      <Footer />
    </div>
  )
}
