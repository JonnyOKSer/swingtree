import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

interface MatchSlot {
  slot: number
  status: 'completed' | 'predicted' | 'known' | 'tbd' | 'void'
  player1: string
  player1_country?: string
  player1_seed?: number
  player2: string
  player2_country?: string
  player2_seed?: number
  winner?: string
  score?: string
  void_reason?: string  // For voided matches (withdrawal, walkover)
  prediction?: {
    predicted_winner: string
    confidence: number
    tier: string
    correct?: boolean
  }
  first_set?: {
    predicted_winner: string
    predicted_score: string
    tiebreak_pct: number
    over_under: string
    divergence: boolean
    score_correct?: boolean
  }
}

interface Round {
  name: string
  display_name: string
  matches: MatchSlot[]
}

interface TournamentDraw {
  tournament: {
    id?: number
    slug: string
    name: string
    category: string
    surface: string
    city: string
    country: string
    current_round: string
    draw_size: number
    tour: string
  }
  rounds: Round[]
}

// Round configuration by draw size
const ROUND_CONFIG: Record<number, { rounds: string[], display: Record<string, string>, matchCounts: Record<string, number> }> = {
  128: {
    rounds: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    display: { R128: 'Round of 128', R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R128: 64, R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  96: {
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    display: { R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  64: {
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    display: { R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  56: {
    rounds: ['R32', 'R16', 'QF', 'SF', 'F'],
    display: { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  48: {
    rounds: ['R32', 'R16', 'QF', 'SF', 'F'],
    display: { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  32: {
    rounds: ['R32', 'R16', 'QF', 'SF', 'F'],
    display: { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }
  },
  28: {
    rounds: ['R16', 'QF', 'SF', 'F'],
    display: { R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' },
    matchCounts: { R16: 8, QF: 4, SF: 2, F: 1 }
  }
}

// Default draw sizes by tournament level
const LEVEL_DRAW_SIZES: Record<string, number> = {
  'G': 128,  // Grand Slam
  'M': 96,   // Masters 1000
  'A': 32,   // ATP 500
  'B': 32,   // ATP 250
  'PM': 64,  // WTA Premier Mandatory
  'F': 8     // Finals
}

function getDrawSize(level: string, actualDrawSize?: number): number {
  if (actualDrawSize && ROUND_CONFIG[actualDrawSize]) {
    return actualDrawSize
  }
  return LEVEL_DRAW_SIZES[level] || 32
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
    let tournamentSlug = pathParts[pathParts.length - 1]

    // Extract tour from slug if present (e.g., "indian-wells-wta" -> tour=WTA)
    // Or from query parameter
    const queryParams = event.queryStringParameters || {}
    let requestedTour = queryParams.tour?.toUpperCase() || null

    // Check if slug ends with -atp or -wta
    if (tournamentSlug.endsWith('-atp')) {
      requestedTour = requestedTour || 'ATP'
      tournamentSlug = tournamentSlug.replace(/-atp$/, '')
    } else if (tournamentSlug.endsWith('-wta')) {
      requestedTour = requestedTour || 'WTA'
      tournamentSlug = tournamentSlug.replace(/-wta$/, '')
    }

    if (!tournamentSlug || tournamentSlug === 'draw') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Tournament ID required' })
      }
    }

    const pool = getPool()

    // Step 1: Find tournament in reference table
    let tournamentInfo: any = null
    try {
      const tournamentResult = await pool.query(`
        SELECT t.tournament_id, t.slug, t.name, t.country, t.country_code,
               t.city, t.surface, t.tourney_level, t.category, t.tour, t.draw_size
        FROM tournaments t
        WHERE t.slug = $1
        UNION
        SELECT t.tournament_id, t.slug, t.name, t.country, t.country_code,
               t.city, t.surface, t.tourney_level, t.category, t.tour, t.draw_size
        FROM tournaments t
        JOIN tournament_aliases a ON t.tournament_id = a.tournament_id
        WHERE LOWER(a.alias_name) = LOWER($2)
        LIMIT 1
      `, [tournamentSlug, tournamentSlug.replace(/-/g, ' ')])

      if (tournamentResult.rows.length > 0) {
        tournamentInfo = tournamentResult.rows[0]
      }
    } catch {
      // tournaments table doesn't exist yet
    }

    const searchPattern = tournamentInfo?.name || tournamentSlug.replace(/-/g, ' ')
    const tourneyLevel = tournamentInfo?.tourney_level || 'M'

    // Note: matches table has data quality issues (challenger contamination)
    // Using prediction_log only - predictions include actual_winner for completed matches

    // Determine tour to filter by (from request, tournament info, or default to ATP)
    const tour = requestedTour || tournamentInfo?.tour || 'ATP'

    // Step 2: Get all aliases for this tournament (for searching predictions)
    let searchPatterns = [searchPattern.toLowerCase()]
    if (tournamentInfo?.tournament_id) {
      try {
        const aliasResult = await pool.query(`
          SELECT alias_name FROM tournament_aliases
          WHERE tournament_id = $1
        `, [tournamentInfo.tournament_id])
        for (const row of aliasResult.rows) {
          searchPatterns.push(row.alias_name.toLowerCase())
        }
      } catch {
        // aliases table doesn't exist
      }
    }

    // Log for monitoring (not verbose debug)
    console.log(`Draw request: ${tournamentSlug} (${tour})`)

    // Step 3a: Get draw data from draw_matches (api-tennis.com source)
    // This gives us the actual bracket with player names
    // Use slug-derived pattern for more flexible matching (e.g., "miami" matches "Miami" and "Miami Open")
    const slugPattern = tournamentSlug.replace(/-/g, ' ').toLowerCase()
    const drawMatchesResult = await pool.query(`
      SELECT
        match_key,
        round_normalized as round,
        player_1_key,
        player_1_name,
        player_2_key,
        player_2_name,
        status,
        winner_key,
        winner_name,
        final_result,
        scheduled_date
      FROM draw_matches
      WHERE LOWER(tournament_name) LIKE $1
        AND UPPER(tour) = $2
      ORDER BY scheduled_date ASC, match_key ASC
    `, [`%${slugPattern}%`, tour])

    console.log(`Found ${drawMatchesResult.rows.length} draw matches for ${tournamentSlug} (${tour})`)

    // Build a lookup for draw matches by round
    const drawByRound: Record<string, any[]> = {}
    for (const match of drawMatchesResult.rows) {
      const round = match.round || 'R64'
      if (!drawByRound[round]) {
        drawByRound[round] = []
      }
      drawByRound[round].push(match)
    }

    // Step 3b: Get ASHE predictions - search by any alias name
    // Filter by tour to separate ATP and WTA draws
    // Exclude qualifying round predictions (round = 'Q')
    const likeConditions = searchPatterns.map((_, i) => `LOWER(tournament) LIKE $${i + 1}`).join(' OR ')
    const predictionsResult = await pool.query(`
      SELECT
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
        first_set_score_correct,
        prediction_date,
        COALESCE(tour, 'ATP') as tour,
        round as prediction_round
      FROM prediction_log
      WHERE (${likeConditions})
        AND prediction_date >= CURRENT_DATE - INTERVAL '14 days'
        AND COALESCE(tour, 'ATP') = $${searchPatterns.length + 1}
        AND (round IS NULL OR round != 'Q')
      ORDER BY prediction_date ASC, id ASC
    `, [...searchPatterns.map(p => `%${p}%`), tour])

    console.log(`Found ${predictionsResult.rows.length} predictions for ${tournamentSlug} (${tour})`)

    // Determine draw size from tournament info
    const drawSize = getDrawSize(tourneyLevel, tournamentInfo?.draw_size)
    const config = ROUND_CONFIG[drawSize] || ROUND_CONFIG[32]

    // Step 4: Group predictions by round field (from prediction_log)
    // Use the stored round value instead of inferring from date
    const predictionsByRound: Record<string, any[]> = {}
    const seenMatches = new Set<string>()

    for (const pred of predictionsResult.rows) {
      // Use the round from prediction_log, default to 'R32' if missing
      const round = pred.prediction_round || 'R32'

      // Skip duplicates (same players, same round)
      const matchKey = [pred.player1_name, pred.player2_name].sort().join('|') + '|' + round
      if (seenMatches.has(matchKey)) continue
      seenMatches.add(matchKey)

      if (!predictionsByRound[round]) {
        predictionsByRound[round] = []
      }
      predictionsByRound[round].push(pred)
    }

    // Log rounds found for monitoring
    if (Object.keys(predictionsByRound).length > 0) {
      console.log('Rounds:', Object.keys(predictionsByRound).join(', '))
    }

    // Step 5: Build complete bracket structure
    const rounds: Round[] = []

    // Find current round: prioritize today's predictions, then fall back to pending predictions
    // This ensures we show "Finals" if today's matches are Finals, even if yesterday's QF are complete
    let currentRound = config.rounds[0] // Default to first round
    const today = new Date().toISOString().split('T')[0]

    // Check from latest round backwards
    for (let i = config.rounds.length - 1; i >= 0; i--) {
      const roundName = config.rounds[i]
      const predictions = predictionsByRound[roundName] || []
      if (predictions.length > 0) {
        // Check if this round has today's predictions (indicates current round)
        const hasTodayPredictions = predictions.some(p => {
          const predDate = typeof p.prediction_date === 'string'
            ? p.prediction_date.split('T')[0]
            : p.prediction_date?.toISOString?.()?.split('T')[0]
          return predDate === today
        })

        // Or has pending predictions (not yet resolved)
        const hasPending = predictions.some(p => !p.actual_winner || p.actual_winner?.startsWith('VOID'))

        if (hasTodayPredictions || hasPending) {
          currentRound = roundName
          break
        }
      }
    }


    // Build prediction lookup by players (normalized for matching)
    const normalizeName = (name: string) => name?.toLowerCase().trim().replace(/\s+/g, ' ') || ''
    const predictionLookup: Record<string, any> = {}
    for (const round of Object.keys(predictionsByRound)) {
      for (const pred of predictionsByRound[round]) {
        // Create lookup key from sorted player names
        const key = [normalizeName(pred.player1_name), normalizeName(pred.player2_name)].sort().join('|') + '|' + round
        predictionLookup[key] = pred
      }
    }

    for (const roundName of config.rounds) {
      const matchCount = config.matchCounts[roundName]
      const drawMatches = drawByRound[roundName] || []
      const predictions = predictionsByRound[roundName] || []
      const matches: MatchSlot[] = []

      // Use draw matches as primary source, fall back to predictions
      const hasDrawData = drawMatches.length > 0

      for (let slot = 0; slot < matchCount; slot++) {
        const drawMatch = drawMatches[slot]
        let prediction = predictions[slot]

        // If we have draw data, try to find matching prediction
        if (drawMatch && !prediction) {
          const lookupKey = [normalizeName(drawMatch.player_1_name), normalizeName(drawMatch.player_2_name)].sort().join('|') + '|' + roundName
          prediction = predictionLookup[lookupKey]
        }

        if (drawMatch) {
          // We have draw data from api-tennis.com
          const player1 = drawMatch.player_1_name
          const player2 = drawMatch.player_2_name

          if (drawMatch.status === 'finished' && drawMatch.winner_name) {
            // Completed match from draw
            const loser = drawMatch.winner_name === player1 ? player2 : player1
            matches.push({
              slot: slot + 1,
              status: 'completed',
              player1: drawMatch.winner_name,
              player2: loser,
              winner: drawMatch.winner_name,
              score: drawMatch.final_result || undefined,
              prediction: prediction ? {
                predicted_winner: prediction.predicted_winner,
                confidence: prediction.predicted_prob || 0.5,
                tier: prediction.confidence_tier || 'PICK',
                correct: prediction.correct ?? (prediction.predicted_winner === drawMatch.winner_name)
              } : undefined,
              first_set: prediction?.first_set_score ? {
                predicted_winner: prediction.first_set_winner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: prediction.first_set_winner !== prediction.predicted_winner,
                score_correct: prediction.first_set_score_correct === true
              } : undefined
            })
          } else if (prediction) {
            // Have both draw and prediction - show as predicted
            const fsWinner = prediction.first_set_winner
            const matchWinner = prediction.predicted_winner

            matches.push({
              slot: slot + 1,
              status: 'predicted',
              player1,
              player2,
              prediction: {
                predicted_winner: prediction.predicted_winner,
                confidence: prediction.predicted_prob || 0.5,
                tier: prediction.confidence_tier || 'PICK'
              },
              first_set: prediction.first_set_score ? {
                predicted_winner: fsWinner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: fsWinner !== matchWinner
              } : undefined
            })
          } else {
            // Draw data but no prediction yet - show as "known"
            matches.push({
              slot: slot + 1,
              status: 'known',
              player1,
              player2
            })
          }
        } else if (prediction) {
          // No draw data but have prediction (legacy path)
          // Check if this prediction is voided (withdrawal, walkover)
          if (prediction.confidence_tier === 'VOID') {
            const voidReason = prediction.actual_winner?.replace('VOID: ', '') || 'Match cancelled'
            matches.push({
              slot: slot + 1,
              status: 'void',
              player1: prediction.player1_name,
              player2: prediction.player2_name,
              void_reason: voidReason,
              prediction: {
                predicted_winner: prediction.predicted_winner,
                confidence: prediction.predicted_prob || 0.5,
                tier: 'VOID'
              }
            })
          } else if (prediction.actual_winner && !prediction.actual_winner.startsWith('VOID:')) {
            // Completed match from prediction_log
            const loser = prediction.player1_name === prediction.actual_winner
              ? prediction.player2_name
              : prediction.player1_name

            matches.push({
              slot: slot + 1,
              status: 'completed',
              player1: prediction.actual_winner,
              player2: loser,
              winner: prediction.actual_winner,
              prediction: {
                predicted_winner: prediction.predicted_winner,
                confidence: prediction.predicted_prob || 0.5,
                tier: prediction.confidence_tier || 'PICK',
                correct: prediction.correct
              },
              first_set: prediction.first_set_score ? {
                predicted_winner: prediction.first_set_winner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: prediction.first_set_winner !== prediction.predicted_winner,
                score_correct: prediction.first_set_score_correct === true
              } : undefined
            })
          } else {
            // Predicted match (not yet played)
            const fsWinner = prediction.first_set_winner
            const matchWinner = prediction.predicted_winner

            matches.push({
              slot: slot + 1,
              status: 'predicted',
              player1: prediction.player1_name,
              player2: prediction.player2_name,
              prediction: {
                predicted_winner: prediction.predicted_winner,
                confidence: prediction.predicted_prob || 0.5,
                tier: prediction.confidence_tier || 'PICK'
              },
              first_set: prediction.first_set_score ? {
                predicted_winner: fsWinner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: fsWinner !== matchWinner
              } : undefined
            })
          }
        } else {
          // TBD slot (no draw data or prediction for this match yet)
          matches.push({
            slot: slot + 1,
            status: 'tbd',
            player1: 'TBD',
            player2: 'TBD'
          })
        }
      }

      rounds.push({
        name: roundName,
        display_name: config.display[roundName],
        matches
      })
    }

    // Determine category based on tour
    let category = tournamentInfo?.category || tour
    if (tour === 'WTA' && category.startsWith('ATP')) {
      category = category.replace('ATP', 'WTA')
    }

    const draw: TournamentDraw = {
      tournament: {
        id: tournamentInfo?.tournament_id,
        slug: tournamentInfo?.slug || tournamentSlug,
        name: tournamentInfo?.name || searchPattern,
        category,
        surface: tournamentInfo?.surface || 'Hard',
        city: tournamentInfo?.city || '',
        country: tournamentInfo?.country || '',
        current_round: config.display[currentRound] || currentRound,
        draw_size: drawSize,
        tour
      },
      rounds
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ...draw })
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
