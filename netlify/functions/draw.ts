import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

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

interface TournamentInfo {
  tournament_id: number
  slug: string
  name: string
  country: string
  country_code: string
  city: string
  surface: string
  tourney_level: string
  category: string
  tour: string
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

    // First, try to find tournament in reference table by slug or alias
    let tournamentInfo: TournamentInfo | null = null

    // Check if tournaments table exists and find by slug
    try {
      const tournamentResult = await pool.query(`
        SELECT t.tournament_id, t.slug, t.name, t.country, t.country_code,
               t.city, t.surface, t.tourney_level, t.category, t.tour
        FROM tournaments t
        WHERE t.slug = $1
        UNION
        SELECT t.tournament_id, t.slug, t.name, t.country, t.country_code,
               t.city, t.surface, t.tourney_level, t.category, t.tour
        FROM tournaments t
        JOIN tournament_aliases a ON t.tournament_id = a.tournament_id
        WHERE LOWER(a.alias_name) = LOWER($2)
        LIMIT 1
      `, [tournamentSlug, tournamentSlug.replace(/-/g, ' ')])

      if (tournamentResult.rows.length > 0) {
        tournamentInfo = tournamentResult.rows[0]
      }
    } catch {
      // tournaments table doesn't exist yet, fall back to fuzzy matching
    }

    // Build search pattern for prediction_log
    const searchPattern = tournamentInfo
      ? tournamentInfo.name.toLowerCase()
      : tournamentSlug.replace(/-/g, ' ').toLowerCase()

    // Get predictions, filtering by tourney_level if we have tournament info
    // Only include G (Grand Slam), M (Masters), A (500), B (250) level events
    const predictionsResult = await pool.query(`
      SELECT
        p.id,
        p.tournament,
        p.round,
        p.player_a as player1_name,
        p.player_b as player2_name,
        p.predicted_winner,
        p.predicted_prob,
        p.confidence_tier,
        p.first_set_winner,
        p.first_set_score,
        p.first_set_tiebreak_prob,
        p.first_set_over_9_5_prob,
        p.actual_winner,
        p.correct,
        COALESCE(p.tour, 'ATP') as tour
      FROM prediction_log p
      WHERE LOWER(p.tournament) LIKE $1
        AND p.prediction_date = (
          SELECT MAX(p2.prediction_date)
          FROM prediction_log p2
          WHERE LOWER(p2.tournament) LIKE $1
            AND p2.confidence_tier != 'SKIP'
        )
        AND p.confidence_tier != 'SKIP'
      ORDER BY
        CASE p.round
          WHEN 'R128' THEN 1 WHEN 'R64' THEN 2 WHEN 'R32' THEN 3
          WHEN 'R16' THEN 4 WHEN 'QF' THEN 5 WHEN 'SF' THEN 6 WHEN 'F' THEN 7
          ELSE 8
        END,
        p.id
    `, [`%${searchPattern}%`])

    if (predictionsResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No predictions found for this tournament',
          hint: 'Predictions appear when matches are scheduled for today'
        })
      }
    }

    // Use tournament info if available, otherwise derive from first result
    const tournamentName = tournamentInfo?.name || predictionsResult.rows[0].tournament
    const tour = tournamentInfo?.tour || predictionsResult.rows[0].tour

    const matches: Match[] = predictionsResult.rows.map((row, idx) => {
      const player1Name = row.player1_name
      const player2Name = row.player2_name
      const predictedWinner = row.predicted_winner

      const winner: 'player1' | 'player2' = predictedWinner === player1Name ? 'player1' : 'player2'
      const firstSetWinner: 'player1' | 'player2' = row.first_set_winner === player1Name ? 'player1' : 'player2'
      const divergence = winner !== firstSetWinner

      const tierMap: Record<string, 'STRONG' | 'CONFIDENT' | 'PICK' | 'LEAN' | 'SKIP'> = {
        'STRONG': 'STRONG',
        'CONFIDENT': 'CONFIDENT',
        'PICK': 'PICK',
        'LEAN': 'LEAN',
        'SKIP': 'SKIP'
      }
      const confidence = tierMap[row.confidence_tier] || 'PICK'

      let status: 'upcoming' | 'live' | 'completed' = 'upcoming'
      let result = undefined

      if (row.actual_winner) {
        status = 'completed'
        result = {
          winner: row.actual_winner === player1Name ? 'player1' as const : 'player2' as const,
          score: ''
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tournament: {
          id: tournamentInfo?.tournament_id,
          slug: tournamentInfo?.slug || tournamentSlug,
          name: tournamentName,
          category: tournamentInfo?.category || tour,
          surface: tournamentInfo?.surface || 'Hard',
          city: tournamentInfo?.city || tournamentName,
          country: tournamentInfo?.country || 'Unknown'
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
