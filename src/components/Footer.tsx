import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-divider">|</span>
          <Link to="/terms">Terms & Conditions</Link>
        </div>
        <p className="footer-copyright">
          &copy; {new Date().getFullYear()} swingtree.ai
        </p>
      </div>
    </footer>
  )
}
