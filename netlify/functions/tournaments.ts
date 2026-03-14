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

    const tournamentMap = new Map<string, Tournament>()

    // Normalize tournament names to avoid duplicates (e.g., "Indian Wells Masters" -> "Indian Wells")
    function normalizeName(name: string): string {
      return name
        .replace(/ Masters$/i, '')
        .replace(/ Open$/i, '')
        .replace(/ Championships$/i, '')
        .trim()
    }

    // Get canonical tournament name for deduplication
    function getCanonicalKey(name: string): string {
      const normalized = normalizeName(name).toLowerCase()
      // Map common variations to canonical names
      if (normalized.includes('indian wells')) return 'indian-wells'
      if (normalized.includes('miami')) return 'miami'
      if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) return 'monte-carlo'
      if (normalized.includes('roland garros') || normalized.includes('french')) return 'roland-garros'
      return normalized.replace(/[^a-z0-9]/g, '-')
    }

    // Get tournaments with recent predictions (active tournaments)
    // A tournament is "active" if it has predictions in the last 14 days
    const recentPredictionsResult = await pool.query(`
      SELECT
        tournament,
        COALESCE(tour, 'ATP') as tour,
        COUNT(*) as pred_count,
        COUNT(CASE WHEN actual_winner IS NOT NULL THEN 1 END) as completed_count,
        MAX(prediction_date) as last_pred_date
      FROM prediction_log
      WHERE prediction_date >= CURRENT_DATE - INTERVAL '14 days'
        AND confidence_tier != 'SKIP'
      GROUP BY tournament, COALESCE(tour, 'ATP')
    `)

    // Get current round from prediction_log (count of completed vs pending)
    // If all predictions are complete, we're waiting on the NEXT round
    function inferCurrentRound(completed: number, pending: number, drawSize: number): string {
      if (pending === 0 && completed > 0) {
        // All predictions completed - show NEXT round (what's being played now)
        if (completed <= 1) return 'Champion' // Final is complete
        if (completed <= 2) return 'Final'     // SF complete, playing Final
        if (completed <= 4) return 'Semifinals' // QF complete, playing SF
        if (completed <= 8) return 'Quarterfinals'
        if (completed <= 16) return 'Round of 16'
        return 'Round of 32'
      }
      // Has pending predictions - that's the current round
      if (pending <= 1) return 'Final'
      if (pending <= 2) return 'Semifinals'
      if (pending <= 4) return 'Quarterfinals'
      if (pending <= 8) return 'Round of 16'
      if (pending <= 16) return 'Round of 32'
      return 'Round of 64'
    }

    for (const row of recentPredictionsResult.rows) {
      const name = row.tournament
      const canonicalKey = getCanonicalKey(name)
      const displayName = normalizeName(name)
      const metadata = TOURNAMENT_METADATA[name] || TOURNAMENT_METADATA[displayName]
      const tour = row.tour || 'ATP'
      const completed = parseInt(row.completed_count) || 0
      const pending = parseInt(row.pred_count) - completed

      // Only add if not already present (deduplication by canonical key)
      if (!tournamentMap.has(canonicalKey)) {
        tournamentMap.set(canonicalKey, {
          id: canonicalKey,
          name: displayName,
          country: metadata?.country || 'Unknown',
          countryCode: metadata?.countryCode || 'UNK',
          city: metadata?.city || displayName,
          surface: 'Hard',
          category: metadata?.category || tour,
          tour: metadata?.tour || tour,
          status: 'active',
          round: inferCurrentRound(completed, pending, 96),
          startDate: null,
          endDate: null
        })
      }
    }

    // Also check tournaments table for upcoming tournaments
    // Show tournaments starting in next 7 days or ending in past 3 days
    // Since we only have typical_month (not exact dates), approximate:
    // - Current month tournaments that aren't already active (late-month starts like Miami)
    // - Next month tournaments
    try {
      const tournamentsTableResult = await pool.query(`
        SELECT
          t.slug,
          t.name,
          t.country,
          t.country_code,
          t.city,
          t.surface,
          t.category,
          t.tour,
          t.typical_month
        FROM tournaments t
        WHERE (t.typical_month = EXTRACT(MONTH FROM CURRENT_DATE)
               OR t.typical_month = EXTRACT(MONTH FROM CURRENT_DATE) + 1)
          AND t.tourney_level IN ('G', 'M', 'PM', 'P5', 'A')
      `)

      for (const row of tournamentsTableResult.rows) {
        const name = row.name
        const canonicalKey = getCanonicalKey(name)

        // Only add if not already present (active tournaments take precedence)
        if (!tournamentMap.has(canonicalKey)) {
          tournamentMap.set(canonicalKey, {
            id: row.slug || canonicalKey,
            name,
            country: row.country || 'Unknown',
            countryCode: row.country_code || 'UNK',
            city: row.city || name,
            surface: row.surface || 'Hard',
            category: row.category || 'ATP',
            tour: row.tour || 'ATP',
            status: 'upcoming',
            round: null,
            startDate: null,
            endDate: null
          })
        }
      }
    } catch {
      // tournaments table might not exist
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
