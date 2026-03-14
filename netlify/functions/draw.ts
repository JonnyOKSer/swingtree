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
    const tournamentSlug = pathParts[pathParts.length - 1]

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
    // Note: The 'round' field in prediction_log is unreliable, so we infer round from prediction_date

    // Step 3: Get ASHE predictions with date for round inference
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
        prediction_date
      FROM prediction_log
      WHERE LOWER(tournament) LIKE $1
        AND prediction_date >= CURRENT_DATE - INTERVAL '14 days'
        AND confidence_tier != 'SKIP'
      ORDER BY prediction_date ASC, id ASC
    `, [`%${searchPattern.toLowerCase()}%`])

    // Determine draw size from tournament info
    const drawSize = getDrawSize(tourneyLevel, tournamentInfo?.draw_size)
    const config = ROUND_CONFIG[drawSize] || ROUND_CONFIG[32]

    // Step 4: Group predictions by date and infer rounds
    // Predictions from the same date belong to the same round
    // Count per date determines which round (32 = R64, 16 = R32, 8 = R16, 4 = QF, 2 = SF, 1 = F)
    const predictionsByDate: Record<string, any[]> = {}
    for (const pred of predictionsResult.rows) {
      const dateKey = pred.prediction_date?.toISOString?.()?.split('T')[0] || pred.prediction_date
      if (!predictionsByDate[dateKey]) predictionsByDate[dateKey] = []
      predictionsByDate[dateKey].push(pred)
    }

    // Sort dates chronologically and assign rounds based on count
    const dates = Object.keys(predictionsByDate).sort()
    const predictionsByRound: Record<string, any[]> = {}
    const playerRoundAssignments: Record<string, string> = {} // player -> round they're already assigned to

    // Map count to round name (approximate - may not be exact for all draw sizes)
    function inferRound(count: number, drawSize: number): string {
      if (drawSize >= 96) {
        if (count >= 24) return 'R64'
        if (count >= 12) return 'R32'
        if (count >= 6) return 'R16'
        if (count >= 3) return 'QF'
        if (count >= 2) return 'SF'
        return 'F'
      } else if (drawSize >= 48) {
        if (count >= 12) return 'R32'
        if (count >= 6) return 'R16'
        if (count >= 3) return 'QF'
        if (count >= 2) return 'SF'
        return 'F'
      } else {
        if (count >= 6) return 'R16'
        if (count >= 3) return 'QF'
        if (count >= 2) return 'SF'
        return 'F'
      }
    }

    // Process dates in order, assigning to rounds
    for (const dateKey of dates) {
      const preds = predictionsByDate[dateKey]
      const inferredRound = inferRound(preds.length, drawSize)

      if (!predictionsByRound[inferredRound]) {
        predictionsByRound[inferredRound] = []
      }

      // Add predictions, ensuring each player only appears once per round
      for (const pred of preds) {
        const p1 = pred.player1_name
        const p2 = pred.player2_name
        const existingRound1 = playerRoundAssignments[p1]
        const existingRound2 = playerRoundAssignments[p2]

        // Skip if either player is already assigned to this round
        if (existingRound1 === inferredRound || existingRound2 === inferredRound) {
          continue
        }

        // Skip if match pair already exists (exact duplicate)
        const matchKey = [p1, p2].sort().join('|')
        const isDuplicate = predictionsByRound[inferredRound].some((existing: any) => {
          const existingKey = [existing.player1_name, existing.player2_name].sort().join('|')
          return existingKey === matchKey
        })
        if (isDuplicate) continue

        playerRoundAssignments[p1] = inferredRound
        playerRoundAssignments[p2] = inferredRound
        predictionsByRound[inferredRound].push(pred)
      }
    }

    // Step 5: Build complete bracket structure
    const rounds: Round[] = []

    // Find current round based on prediction state
    // If a round has pending predictions, that's the current round
    // If all predictions are complete, current round is the NEXT round after the last with predictions
    let currentRound = config.rounds[0] // Default to first round
    let foundPending = false
    let lastCompletedRound = ''

    for (const roundName of config.rounds) {
      const predictions = predictionsByRound[roundName] || []
      if (predictions.length > 0) {
        const hasPending = predictions.some(p => !p.actual_winner)
        if (hasPending) {
          currentRound = roundName
          foundPending = true
          break
        } else {
          lastCompletedRound = roundName
        }
      }
    }

    // If no pending predictions found, current round is AFTER the last completed round
    if (!foundPending && lastCompletedRound) {
      const lastIndex = config.rounds.indexOf(lastCompletedRound)
      if (lastIndex >= 0 && lastIndex < config.rounds.length - 1) {
        currentRound = config.rounds[lastIndex + 1]
      } else {
        currentRound = 'F' // Tournament complete
      }
    }

    for (const roundName of config.rounds) {
      const matchCount = config.matchCounts[roundName]
      const predictions = predictionsByRound[roundName] || []
      const matches: MatchSlot[] = []

      for (let slot = 0; slot < matchCount; slot++) {
        const prediction = predictions[slot]

        if (prediction) {
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
                divergence: prediction.first_set_winner !== prediction.predicted_winner
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
          // TBD slot (no prediction for this match yet)
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

    const draw: TournamentDraw = {
      tournament: {
        id: tournamentInfo?.tournament_id,
        slug: tournamentInfo?.slug || tournamentSlug,
        name: tournamentInfo?.name || searchPattern,
        category: tournamentInfo?.category || 'ATP',
        surface: tournamentInfo?.surface || 'Hard',
        city: tournamentInfo?.city || '',
        country: tournamentInfo?.country || '',
        current_round: config.display[currentRound] || currentRound,
        draw_size: drawSize
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
