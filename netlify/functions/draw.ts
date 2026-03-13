import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool, TOURNAMENT_METADATA, levelToCategory } from './db'

interface Player {
  name: string
  seed?: number
  country: string
}

interface Prediction {
  winner: 'player1' | 'player2'
  confidence: 'STRONG' | 'CONFIDENT' | 'PICK' | 'LEAN' | 'SKIP'
  winProbability: number
  firstSetWinner: 'player1' | 'player2'
  firstSetScore: string
  tiebreakPct: number
  overUnder: 'O' | 'U'
  divergence: boolean
}

interface Match {
  id: string
  round: string
  player1: Player | null
  player2: Player | null
  prediction?: Prediction
  result?: {
    winner: 'player1' | 'player2'
    score: string
  }
  status: 'upcoming' | 'live' | 'completed'
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // Get tournament from path: /api/draw/tournament-name
    const pathParts = event.path.split('/')
    const tournamentSlug = pathParts[pathParts.length - 1]

    if (!tournamentSlug || tournamentSlug === 'draw') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Tournament ID required' })
      }
    }

    const pool = getPool()
    const today = new Date().toISOString().split('T')[0]

    // Find tournament by slug (fuzzy match on name)
    const tournamentSearch = tournamentSlug.replace(/-/g, ' ')

    // Get predictions for this tournament
    const predictionsResult = await pool.query(`
      SELECT
        id,
        tournament,
        round,
        player_a as player1_name,
        player_b as player2_name,
        predicted_winner,
        predicted_prob,
        confidence_tier,
        first_set_winner,
        first_set_score,
        first_set_tiebreak_prob,
        first_set_over_9_5_prob,
        actual_winner,
        correct,
        COALESCE(tour, 'ATP') as tour
      FROM prediction_log
      WHERE LOWER(tournament) LIKE $1
        AND prediction_date >= $2::date - INTERVAL '7 days'
      ORDER BY prediction_date DESC, round
    `, [`%${tournamentSearch.toLowerCase()}%`, today])

    if (predictionsResult.rows.length === 0) {
      // Try to find in todays_matches
      const matchesResult = await pool.query(`
        SELECT
          tournament,
          surface,
          tourney_level,
          round,
          player_a_name,
          player_b_name,
          COALESCE(tour, 'ATP') as tour
        FROM todays_matches
        WHERE LOWER(tournament) LIKE $1
          AND match_date >= $2::date - INTERVAL '7 days'
        ORDER BY round
      `, [`%${tournamentSearch.toLowerCase()}%`, today])

      if (matchesResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Tournament not found' })
        }
      }

      // Return matches without predictions
      const tournamentName = matchesResult.rows[0].tournament
      const metadata = TOURNAMENT_METADATA[tournamentName]

      const matches: Match[] = matchesResult.rows.map((row, idx) => ({
        id: `${row.round}-${idx}`,
        round: row.round,
        player1: { name: row.player_a_name, country: '' },
        player2: { name: row.player_b_name, country: '' },
        status: 'upcoming' as const
      }))

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tournament: {
            name: tournamentName,
            category: metadata?.category || 'ATP',
            surface: matchesResult.rows[0].surface || 'Hard',
            city: metadata?.city || tournamentName,
            country: metadata?.country || 'Unknown'
          },
          matches
        })
      }
    }

    // Process predictions into matches
    const tournamentName = predictionsResult.rows[0].tournament
    const metadata = TOURNAMENT_METADATA[tournamentName]
    const tour = predictionsResult.rows[0].tour

    const matches: Match[] = predictionsResult.rows.map((row, idx) => {
      const player1Name = row.player1_name
      const player2Name = row.player2_name
      const predictedWinner = row.predicted_winner

      // Determine which player is the predicted winner
      const winner: 'player1' | 'player2' = predictedWinner === player1Name ? 'player1' : 'player2'
      const firstSetWinner: 'player1' | 'player2' = row.first_set_winner === player1Name ? 'player1' : 'player2'
      const divergence = winner !== firstSetWinner

      // Map confidence tier
      const tierMap: Record<string, 'STRONG' | 'CONFIDENT' | 'PICK' | 'LEAN' | 'SKIP'> = {
        'STRONG': 'STRONG',
        'CONFIDENT': 'CONFIDENT',
        'PICK': 'PICK',
        'LEAN': 'LEAN',
        'SKIP': 'SKIP'
      }
      const confidence = tierMap[row.confidence_tier] || 'PICK'

      // Determine match status
      let status: 'upcoming' | 'live' | 'completed' = 'upcoming'
      let result = undefined

      if (row.actual_winner) {
        status = 'completed'
        result = {
          winner: row.actual_winner === player1Name ? 'player1' as const : 'player2' as const,
          score: '' // Score not stored in prediction_log
        }
      }

      const prediction: Prediction = {
        winner,
        confidence,
        winProbability: row.predicted_prob || 0.5,
        firstSetWinner,
        firstSetScore: row.first_set_score || '6-4',
        tiebreakPct: Math.round((row.first_set_tiebreak_prob || 0.15) * 100),
        overUnder: (row.first_set_over_9_5_prob || 0.5) > 0.5 ? 'O' : 'U',
        divergence
      }

      return {
        id: `${row.round}-${idx}`,
        round: row.round,
        player1: { name: player1Name, country: '' },
        player2: { name: player2Name, country: '' },
        prediction,
        result,
        status
      }
    })

    // Get tournament surface from todays_matches or recent matches
    let surface = 'Hard'
    const surfaceResult = await pool.query(`
      SELECT surface FROM todays_matches
      WHERE LOWER(tournament) LIKE $1
      LIMIT 1
    `, [`%${tournamentSearch.toLowerCase()}%`])

    if (surfaceResult.rows.length > 0) {
      surface = surfaceResult.rows[0].surface
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tournament: {
          name: tournamentName,
          category: metadata?.category || levelToCategory('A', tour),
          surface,
          city: metadata?.city || tournamentName,
          country: metadata?.country || 'Unknown'
        },
        matches
      })
    }
  } catch (error) {
    console.error('Error fetching draw:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export { handler }
