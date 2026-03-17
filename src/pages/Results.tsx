import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import './Results.css'

// FAQ data
const FAQ_ITEMS = [
  {
    question: "How does ASHE make predictions?",
    answer: "ASHE uses a proprietary ELO-based model that analyzes historical match data, surface performance, head-to-head records, and recent form. The model processes 364,000+ professional tennis matches to identify statistical patterns that predict match outcomes."
  },
  {
    question: "What do STRONG, CONFIDENT, PICK, and SKIP mean?",
    answer: "These are confidence tiers. STRONG indicates the highest conviction picks with historically 85%+ accuracy. CONFIDENT shows solid edges. PICK represents standard predictions worth considering. SKIP means the model sees no clear edge and recommends passing on the match."
  },
  {
    question: "How many matches is the model trained on?",
    answer: "The model is trained on over 364,000 professional tennis matches spanning ATP and WTA tours from 2000 to present. This includes all Grand Slams, Masters 1000 events, and tour-level competitions."
  },
  {
    question: "What is a first set score prediction?",
    answer: "Beyond predicting the match winner, ASHE forecasts the exact first set score (e.g., 6-4, 7-5). This includes tiebreak probability and over/under 9.5 games analysis. The divergence indicator shows when the predicted first set winner differs from the predicted match winner."
  },
  {
    question: "How often is ASHE updated?",
    answer: "ASHE runs autonomously. Predictions are generated daily for upcoming matches across ATP and WTA tours, and results are reconciled regularly throughout the day. Player ratings update automatically as matches complete."
  }
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
      <button className="faq-question" onClick={() => setIsOpen(!isOpen)}>
        <span>{question}</span>
        <span className="faq-icon">{isOpen ? '−' : '+'}</span>
      </button>
      <div className="faq-answer">
        <p>{answer}</p>
      </div>
    </div>
  )
}

interface TourResults {
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface TournamentResults {
  tournament: string
  tour: string
  year: number
  match: { wins: number; total: number; percentage: number }
  firstSet: { wins: number; total: number; percentage: number }
}

interface ResultsData {
  atp: TourResults
  wta: TourResults
  byTournament?: TournamentResults[]
}

// Fallback data when API is unavailable
const FALLBACK_RESULTS: ResultsData = {
  atp: {
    match: { wins: 0, total: 0, percentage: 0 },
    firstSet: { wins: 0, total: 0, percentage: 0 }
  },
  wta: {
    match: { wins: 0, total: 0, percentage: 0 },
    firstSet: { wins: 0, total: 0, percentage: 0 }
  }
}

function ResultBox({
  label,
  wins,
  total
}: {
  label: string
  wins: number
  total: number
}) {
  const percentage = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'
  const progress = total > 0 ? (wins / total) * 100 : 0

  return (
    <div className="result-box">
      <h3 className="result-label">{label}</h3>
      <div className="result-fraction mono">
        {wins} / {total}
      </div>
      <div className="result-percentage mono">{percentage}%</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function TournamentRow({ tournament }: { tournament: TournamentResults }) {
  const matchPct = tournament.match.percentage
  const fsPct = tournament.firstSet.percentage

  return (
    <div className="tournament-row">
      <div className="tournament-info">
        <span className="tournament-name">{tournament.tournament}</span>
        <span className="tournament-tour">{tournament.tour} {tournament.year}</span>
      </div>
      <div className="tournament-stats">
        <div className="tournament-stat">
          <span className="stat-label">Match</span>
          <span className="stat-value mono">
            {tournament.match.wins}/{tournament.match.total}
          </span>
          <span className={`stat-pct mono ${matchPct >= 60 ? 'good' : matchPct >= 50 ? 'ok' : 'bad'}`}>
            {matchPct}%
          </span>
        </div>
        <div className="tournament-stat">
          <span className="stat-label">1st Set</span>
          <span className="stat-value mono">
            {tournament.firstSet.wins}/{tournament.firstSet.total}
          </span>
          <span className={`stat-pct mono ${fsPct >= 30 ? 'good' : fsPct >= 20 ? 'ok' : 'bad'}`}>
            {fsPct}%
          </span>
        </div>
      </div>
    </div>
  )
}

type TabView = 'overall' | 'tournament'

export default function Results() {
  const isAuthenticated = sessionStorage.getItem('ashe-authenticated') === 'true'
  const [results, setResults] = useState<ResultsData>(FALLBACK_RESULTS)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabView>('overall')

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch('/api/results')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.results) {
            setResults(data.results)
          }
        }
      } catch (error) {
        console.error('Failed to fetch results:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  return (
    <div className="results-page">
      <header className="results-header">
        <Link to="/main" className="results-wordmark serif">ASHE</Link>
        <p className="results-subtitle">Track Record</p>
      </header>

      <div className="results-tabs">
        <button
          className={`tab-btn ${activeTab === 'overall' ? 'active' : ''}`}
          onClick={() => setActiveTab('overall')}
        >
          Overall
        </button>
        <button
          className={`tab-btn ${activeTab === 'tournament' ? 'active' : ''}`}
          onClick={() => setActiveTab('tournament')}
        >
          By Tournament
        </button>
      </div>

      {loading ? (
        <div className="results-loading">
          <p>Loading results...</p>
        </div>
      ) : activeTab === 'overall' ? (
        <>
          <div className="results-grid">
            <ResultBox
              label="ATP MATCH"
              wins={results.atp.match.wins}
              total={results.atp.match.total}
            />
            <ResultBox
              label="ATP 1ST SET"
              wins={results.atp.firstSet.wins}
              total={results.atp.firstSet.total}
            />
            <ResultBox
              label="WTA MATCH"
              wins={results.wta.match.wins}
              total={results.wta.match.total}
            />
            <ResultBox
              label="WTA 1ST SET"
              wins={results.wta.firstSet.wins}
              total={results.wta.firstSet.total}
            />
          </div>
          <p className="results-note">
            Activation Date: March 13 2026. Match Records include Strong, Confident, Pick, Lean Tier Predictions. 1st Set Stats include all tiers but exclude qualifying rounds.
          </p>
        </>
      ) : (
        <div className="tournament-list">
          {results.byTournament && results.byTournament.length > 0 ? (
            results.byTournament.map((t, i) => (
              <TournamentRow key={`${t.tournament}-${t.tour}-${i}`} tournament={t} />
            ))
          ) : (
            <p className="no-tournaments">No tournament data available yet.</p>
          )}
        </div>
      )}

      <section className="faq-section">
        <h2 className="faq-title">FAQ</h2>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, index) => (
            <FAQItem key={index} question={item.question} answer={item.answer} />
          ))}
        </div>
      </section>

      <footer className="results-footer">
        {isAuthenticated ? (
          <Link to="/main" className="back-link">
            Back to menu
          </Link>
        ) : (
          <Link to="/" className="enter-btn">
            Enter the ASHE
          </Link>
        )}
      </footer>

      <Footer />
    </div>
  )
}
