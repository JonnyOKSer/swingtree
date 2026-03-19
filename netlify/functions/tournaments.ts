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
  status: 'active' | 'upcoming' | 'completed'
  round: string | null
  startDate: string | null
  endDate: string | null
  lastPredDate?: string
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
    // Get the latest round from the most recent prediction date
    const recentPredictionsResult = await pool.query(`
      WITH latest_rounds AS (
        SELECT
          tournament,
          COALESCE(tour, 'ATP') as tour,
          round,
          prediction_date,
          actual_winner,
          ROW_NUMBER() OVER (
            PARTITION BY tournament, COALESCE(tour, 'ATP')
            ORDER BY prediction_date DESC,
              CASE round
                WHEN 'F' THEN 1
                WHEN 'SF' THEN 2
                WHEN 'QF' THEN 3
                WHEN 'R16' THEN 4
                WHEN 'R32' THEN 5
                WHEN 'R64' THEN 6
                ELSE 7
              END
          ) as rn
        FROM prediction_log
        WHERE prediction_date >= CURRENT_DATE - INTERVAL '14 days'
      ),
      tournament_stats AS (
        SELECT
          tournament,
          COALESCE(tour, 'ATP') as tour,
          COUNT(*) as pred_count,
          COUNT(CASE WHEN actual_winner IS NOT NULL THEN 1 END) as completed_count,
          MAX(prediction_date) as last_pred_date,
          COUNT(CASE WHEN prediction_date = CURRENT_DATE AND actual_winner IS NULL THEN 1 END) as today_pending
        FROM prediction_log
        WHERE prediction_date >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY tournament, COALESCE(tour, 'ATP')
      )
      SELECT
        ts.tournament,
        ts.tour,
        ts.pred_count,
        ts.completed_count,
        ts.last_pred_date,
        ts.today_pending,
        lr.round as latest_round,
        (lr.actual_winner IS NOT NULL) as latest_completed
      FROM tournament_stats ts
      LEFT JOIN latest_rounds lr
        ON lr.tournament = ts.tournament
        AND lr.tour = ts.tour
        AND lr.rn = 1
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

    for (const row of recentPredictionsResult.rows) {
      const name = row.tournament
      const tour = row.tour || 'ATP'
      const canonicalKey = getCanonicalKey(name, tour)
      const displayName = getDisplayName(name)
      const metadata = TOURNAMENT_METADATA[name] || TOURNAMENT_METADATA[displayName]
      const todayPending = parseInt(row.today_pending) || 0
      const latestRound = row.latest_round
      const latestCompleted = row.latest_completed
      const lastPredDate = row.last_pred_date

      // Determine category based on tour
      let category = metadata?.category || tour
      if (tour === 'WTA' && category.startsWith('ATP')) {
        category = category.replace('ATP', 'WTA')
      }

      // Determine status and round
      let status: 'active' | 'upcoming' | 'completed' = 'active'
      let displayRound = latestRound ? ROUND_DISPLAY[latestRound] || latestRound : 'Round of 64'

      // Qualifying rounds - tournament hasn't really started main draw yet
      // Note: 'QF' is Quarterfinals, not Qualifying - only match exact 'Q' or 'Q1', 'Q2', 'Q3'
      const isQualifying = latestRound === 'Q' || /^Q\d*$/.test(latestRound || '')

      // If the latest round prediction is completed (has actual_winner), tournament might be done
      // If latest round is Final and it's completed, tournament is done
      if (latestRound === 'F' && latestCompleted) {
        status = 'completed'
        displayRound = 'Final'
      } else if (isQualifying) {
        // Still in qualifying or qualifying just finished - show as upcoming for main draw
        status = 'active'
        displayRound = 'Qualifying'
      } else if (todayPending === 0 && latestCompleted && !isQualifying) {
        // No pending today and latest main draw round is completed
        // Mark as completed if it's been more than a day since last prediction
        const lastDate = new Date(lastPredDate)
        const today = new Date()
        const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince >= 1) {
          status = 'completed'
        }
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
          tour,
          status,
          round: displayRound,
          startDate: null,
          endDate: null,
          lastPredDate: lastPredDate
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
          t.typical_month,
          t.start_date,
          t.end_date
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
              startDate: row.start_date ? row.start_date.toISOString().split('T')[0] : null,
              endDate: row.end_date ? row.end_date.toISOString().split('T')[0] : null
            })
          }
        }
      }
    } catch {
      // tournaments table might not exist
    }

    // Sort tournaments: active first, then upcoming, then completed
    const statusOrder: Record<string, number> = { active: 0, upcoming: 1, completed: 2 }
    const tournaments = Array.from(tournamentMap.values()).sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status]
      if (statusDiff !== 0) return statusDiff
      // Within same status, sort by name
      return a.name.localeCompare(b.name)
    })

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
