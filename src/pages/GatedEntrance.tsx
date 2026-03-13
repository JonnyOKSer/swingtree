import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import SerengetiScene from '../components/SerengetiScene'
import './GatedEntrance.css'

// For now, hardcoded valid codes - will move to backend
const VALID_CODES = ['ASHE2026', 'ORACLE', 'TREETOP']

export default function GatedEntrance() {
  const [code, setCode] = useState('')
  const [shake, setShake] = useState(false)
  const [entering, setEntering] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (VALID_CODES.includes(code.toUpperCase())) {
      // Success - trigger entrance animation
      setEntering(true)
      sessionStorage.setItem('ashe-authenticated', 'true')
      setTimeout(() => {
        navigate('/main')
      }, 800)
    } else {
      // Wrong code - shake
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setCode('')
    }
  }

  return (
    <div className={`gated-entrance ${entering ? 'entering' : ''}`}>
      <SerengetiScene />

      <div className="entrance-content">
        <h1 className="wordmark serif">ASHE</h1>
        <p className="tagline">Play from the tree tops.</p>

        <form onSubmit={handleSubmit} className={`code-form ${shake ? 'shake' : ''}`}>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder=""
            className="code-input mono"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="enter-btn">
            Enter
          </button>
        </form>

        <Link to="/results" className="track-record-link">
          View our track record
        </Link>
      </div>
    </div>
  )
}
