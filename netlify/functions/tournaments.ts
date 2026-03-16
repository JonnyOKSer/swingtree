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

    // Map tournament names to canonical display names
    function getDisplayName(name: string): string {
      const normalized = normalizeName(name).toLowerCase()
      if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) return 'Indian Wells'
      if (normalized.includes('miami')) return 'Miami Open'
      if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) return 'Monte-Carlo Masters'
      if (normalized.includes('roland garros') || normalized.includes('french')) return 'Roland Garros'
      return normalizeName(name)
    }

    // Get canonical tournament name for deduplication
    // Include tour in key so ATP and WTA draws show separately
    function getCanonicalKey(name: string, tour: string = 'ATP'): string {
      const normalized = normalizeName(name).toLowerCase()
      let base = normalized
      // Map common variations to canonical names
      if (normalized.includes('indian wells') || normalized.includes('bnp paribas')) base = 'indian-wells'
      else if (normalized.includes('miami')) base = 'miami'
      else if (normalized.includes('monte carlo') || normalized.includes('monte-carlo')) base = 'monte-carlo'
      else if (normalized.includes('roland garros') || normalized.includes('french')) base = 'roland-garros'
      else base = normalized.replace(/[^a-z0-9]/g, '-')

      // For combined events, keep separate entries for ATP and WTA
      // Grand Slams and shared 1000s have both tours
      return `${base}-${tour.toLowerCase()}`
    }

    // Get tournaments with recent predictions (active tournaments)
    // A tournament is "active" if it has predictions in the last 14 days
    // Include all tiers (including SKIP) so WTA shows
    // Also get today's round to prioritize current-day matches over historical completed ones
    const recentPredictionsResult = await pool.query(`
      SELECT
        tournament,
        COALESCE(tour, 'ATP') as tour,
        COUNT(*) as pred_count,
        COUNT(CASE WHEN actual_winner IS NOT NULL THEN 1 END) as completed_count,
        MAX(prediction_date) as last_pred_date,
        MAX(CASE WHEN prediction_date = CURRENT_DATE THEN round END) as today_round,
        COUNT(CASE WHEN prediction_date = CURRENT_DATE THEN 1 END) as today_count,
        COUNT(CASE WHEN prediction_date = CURRENT_DATE AND actual_winner IS NULL THEN 1 END) as today_pending
      FROM prediction_log
      WHERE prediction_date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY tournament, COALESCE(tour, 'ATP')
    `)

    // Map round codes to display names
    const ROUND_DISPLAY: Record<string, string> = {
      'F': 'Final',
      'SF': 'Semifinals',
      'QF': 'Quarterfinals',
      'R16': 'Round of 16',
      'R32': 'Round of 32',
      'R64': 'Round of 64',
      'R128': 'Round of 128'
    }

    // Get current round from prediction_log
    // Priority: today's round > pending predictions count > completed predictions count
    function inferCurrentRound(completed: number, pending: number, drawSize: number, todayRound?: string, todayPending?: number): string {
      // If there are predictions for today, use today's round (most accurate)
      if (todayRound && ROUND_DISPLAY[todayRound]) {
        return ROUND_DISPLAY[todayRound]
      }

      // Fall back to counting pending predictions (today's round wasn't captured)
      if (pending > 0) {
        if (pending <= 1) return 'Final'
        if (pending <= 2) return 'Semifinals'
        if (pending <= 4) return 'Quarterfinals'
        if (pending <= 8) return 'Round of 16'
        if (pending <= 16) return 'Round of 32'
        return 'Round of 64'
      }

      // All predictions completed - infer next round from completion count
      if (completed > 0) {
        if (completed <= 1) return 'Champion' // Final is complete
        if (completed <= 2) return 'Final'     // SF complete, playing Final
        if (completed <= 4) return 'Semifinals' // QF complete, playing SF
        if (completed <= 8) return 'Quarterfinals'
        if (completed <= 16) return 'Round of 16'
        return 'Round of 32'
      }

      return 'Round of 64'
    }

    for (const row of recentPredictionsResult.rows) {
      const name = row.tournament
      const tour = row.tour || 'ATP'
      const canonicalKey = getCanonicalKey(name, tour)
      const displayName = getDisplayName(name)
      const metadata = TOURNAMENT_METADATA[name] || TOURNAMENT_METADATA[displayName]
      const completed = parseInt(row.completed_count) || 0
      const pending = parseInt(row.pred_count) - completed
      const todayRound = row.today_round || undefined
      const todayPending = parseInt(row.today_pending) || 0

      // Determine category based on tour
      let category = metadata?.category || tour
      if (tour === 'WTA' && category.startsWith('ATP')) {
        category = category.replace('ATP', 'WTA')
      }

      // Only add if not already present (deduplication by canonical key + tour)
      if (!tournamentMap.has(canonicalKey)) {
        tournamentMap.set(canonicalKey, {
          id: canonicalKey,
          name: displayName,
          country: metadata?.country || 'Unknown',
          countryCode: metadata?.countryCode || 'UNK',
          city: metadata?.city || displayName,
          surface: 'Hard',
          category,
          tour,  // Use actual tour from prediction_log, not metadata
          status: 'active',
          round: inferCurrentRound(completed, pending, 96, todayRound, todayPending),
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
        const dbTour = row.tour || 'ATP'

        // For combined events (ATP/WTA), add TWO separate entries
        const toursToAdd = dbTour === 'ATP/WTA' ? ['ATP', 'WTA'] : [dbTour]

        for (const tour of toursToAdd) {
          const canonicalKey = getCanonicalKey(name, tour)

          // Only add if not already present (active tournaments take precedence)
          if (!tournamentMap.has(canonicalKey)) {
            // Adjust category for WTA (e.g., "ATP 1000" -> "WTA 1000")
            let category = row.category || tour
            if (tour === 'WTA' && category.startsWith('ATP')) {
              category = category.replace('ATP', 'WTA')
            }

            tournamentMap.set(canonicalKey, {
              id: row.slug ? `${row.slug}-${tour.toLowerCase()}` : canonicalKey,
              name,
              country: row.country || 'Unknown',
              countryCode: row.country_code || 'UNK',
              city: row.city || name,
              surface: row.surface || 'Hard',
              category,
              tour,
              status: 'upcoming',
              round: null,
              startDate: null,
              endDate: null
            })
          }
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
