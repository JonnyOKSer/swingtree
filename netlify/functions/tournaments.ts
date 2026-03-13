import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool, TOURNAMENT_METADATA, levelToCategory } from './db'

interface Tournament {
  id: string
  name: string
  country: string
  countryCode: string
  city: string
  surface: string
  category: string
  tour: string
  status: 'active' | 'upcoming'
  round: string | null
  startDate: string | null
  endDate: string | null
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const pool = getPool()
    const today = new Date().toISOString().split('T')[0]

    // Get active tournaments (have matches today or predictions today)
    const activeResult = await pool.query(`
      SELECT DISTINCT
        tournament,
        surface,
        tourney_level,
        COALESCE(tour, 'ATP') as tour,
        MAX(round) as current_round
      FROM todays_matches
      WHERE match_date = $1
      GROUP BY tournament, surface, tourney_level, COALESCE(tour, 'ATP')
    `, [today])

    // Also check prediction_log for today's predictions (backup)
    const predictionsResult = await pool.query(`
      SELECT DISTINCT
        tournament,
        COALESCE(tour, 'ATP') as tour,
        MAX(round) as current_round
      FROM prediction_log
      WHERE prediction_date = $1
      GROUP BY tournament, COALESCE(tour, 'ATP')
    `, [today])

    // Combine and dedupe tournaments
    const tournamentMap = new Map<string, Tournament>()

    // Process active tournaments from todays_matches
    for (const row of activeResult.rows) {
      const name = row.tournament
      const metadata = TOURNAMENT_METADATA[name]
      const tour = row.tour || 'ATP'

      tournamentMap.set(name, {
        id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name,
        country: metadata?.country || 'Unknown',
        countryCode: metadata?.countryCode || 'UNK',
        city: metadata?.city || name,
        surface: row.surface || 'Hard',
        category: metadata?.category || levelToCategory(row.tourney_level, tour),
        tour: metadata?.tour || tour,
        status: 'active',
        round: row.current_round,
        startDate: null,
        endDate: null
      })
    }

    // Add from predictions if not already present
    for (const row of predictionsResult.rows) {
      const name = row.tournament
      if (!tournamentMap.has(name)) {
        const metadata = TOURNAMENT_METADATA[name]
        const tour = row.tour || 'ATP'

        tournamentMap.set(name, {
          id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name,
          country: metadata?.country || 'Unknown',
          countryCode: metadata?.countryCode || 'UNK',
          city: metadata?.city || name,
          surface: 'Hard', // Default
          category: metadata?.category || tour,
          tour: metadata?.tour || tour,
          status: 'active',
          round: row.current_round,
          startDate: null,
          endDate: null
        })
      }
    }

    // Get upcoming tournaments from recent matches (next week's tournaments)
    const upcomingResult = await pool.query(`
      SELECT DISTINCT
        tourney_name as tournament,
        surface,
        tourney_level
      FROM matches
      WHERE tourney_date > $1
        AND tourney_date <= $1::date + INTERVAL '14 days'
      UNION
      SELECT DISTINCT
        tourney_name as tournament,
        surface,
        tourney_level
      FROM wta_matches
      WHERE tourney_date > $1
        AND tourney_date <= $1::date + INTERVAL '14 days'
    `, [today])

    for (const row of upcomingResult.rows) {
      const name = row.tournament
      if (!tournamentMap.has(name)) {
        const metadata = TOURNAMENT_METADATA[name]

        tournamentMap.set(name, {
          id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name,
          country: metadata?.country || 'Unknown',
          countryCode: metadata?.countryCode || 'UNK',
          city: metadata?.city || name,
          surface: row.surface || 'Hard',
          category: metadata?.category || levelToCategory(row.tourney_level, 'ATP'),
          tour: metadata?.tour || 'ATP',
          status: 'upcoming',
          round: null,
          startDate: null,
          endDate: null
        })
      }
    }

    const tournaments = Array.from(tournamentMap.values())

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        date: today,
        tournaments
      })
    }
  } catch (error) {
    console.error('Error fetching tournaments:', error)
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
