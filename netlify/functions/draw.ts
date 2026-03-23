import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

// ESPN API endpoints for hybrid draw data
const ESPN_ATP_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'
const ESPN_WTA_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'

// Fetch upcoming matches from ESPN that may be missing from api-tennis
async function fetchESPNMatches(tournamentName: string, tour: string): Promise<Array<{
  round: string
  player1: string
  player2: string
  status: 'upcoming' | 'live' | 'finished'
}>> {
  const url = tour === 'WTA' ? ESPN_WTA_URL : ESPN_ATP_URL

  try {
    const response = await fetch(url)
    if (!response.ok) return []

    const data = await response.json()
    const matches: Array<{
      round: string
      player1: string
      player2: string
      status: 'upcoming' | 'live' | 'finished'
    }> = []

    // Find the matching tournament
    const tournamentLower = tournamentName.toLowerCase()
    for (const event of data.events || []) {
      const eventName = (event.name || '').toLowerCase()
      // Match by tournament name (e.g., "miami" in "Miami Open presented by Itau")
      if (!eventName.includes(tournamentLower.split('-')[0])) continue

      // Find singles grouping
      const singlesSlug = tour === 'WTA' ? 'womens-singles' : 'mens-singles'

      for (const grouping of event.groupings || []) {
        if (grouping.grouping?.slug !== singlesSlug) continue

        for (const comp of grouping.competitions || []) {
          const competitors = comp.competitors || []
          if (competitors.length < 2) continue

          const p1 = competitors[0]?.athlete?.displayName
          const p2 = competitors[1]?.athlete?.displayName
          if (!p1 || !p2 || p1 === 'TBD' || p2 === 'TBD') continue

          // Determine status
          const stateStr = comp.status?.type?.state || 'pre'
          let status: 'upcoming' | 'live' | 'finished' = 'upcoming'
          if (stateStr === 'post') status = 'finished'
          else if (stateStr === 'in') status = 'live'

          // Include all matches - even finished ones help correct api-tennis round assignments
          // Normalize round name from comp.round.displayName (e.g., "Round 2", "Quarterfinals")
          const roundName = comp.round?.displayName || ''
          let round = 'R32' // default
          const roundLower = roundName.toLowerCase()

          // Skip qualifying rounds - they shouldn't appear in main draw
          if (roundLower.includes('qualifying') || roundLower.includes('qual')) {
            continue // Skip this match
          }

          if (roundLower === 'final' || roundLower === 'finals') round = 'F'
          else if (roundLower.includes('semi')) round = 'SF'
          else if (roundLower.includes('quarter')) round = 'QF'
          else if (roundLower === 'round 4' || roundLower === '4th round') round = 'R16'
          else if (roundLower === 'round 3' || roundLower === '3rd round') round = 'R32'
          else if (roundLower === 'round 2' || roundLower === '2nd round') round = 'R64'
          else if (roundLower === 'round 1' || roundLower === '1st round') round = 'R128'

          matches.push({ round, player1: p1, player2: p2, status })
        }
      }
    }

    return matches
  } catch (error) {
    console.error('ESPN fetch error:', error)
    return []
  }
}

// Calculate confidence tier from probability (fixes bug in prediction engine)
function getConfidenceTier(prob: number): string {
  const pct = prob * 100
  if (pct >= 85) return 'STRONG'
  if (pct >= 75) return 'CONFIDENT'
  if (pct >= 65) return 'PICK'
  if (pct >= 55) return 'LEAN'
  return 'SKIP'
}

interface MatchSlot {
  slot: number
  status: 'completed' | 'predicted' | 'known' | 'tbd' | 'void' | 'bye'
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
    // Use FIRST WORD of slug for matching (e.g., "miami-open" -> "miami" matches "Miami")
    // This handles cases where frontend sends "miami-open" but DB has just "Miami"
    const slugWords = tournamentSlug.replace(/-/g, ' ').toLowerCase().split(' ')
    const primaryWord = slugWords[0] // First word is usually the city/tournament name
    // Filter to matches from the last 14 days to avoid historical data pollution
    // Exclude qualifying rounds (Q) - they shouldn't appear in main draw
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
        AND scheduled_date >= CURRENT_DATE - INTERVAL '14 days'
        AND round_normalized != 'Q'
      ORDER BY scheduled_date ASC, match_key ASC
    `, [`%${primaryWord}%`, tour])

    console.log(`Found ${drawMatchesResult.rows.length} draw matches for ${tournamentSlug} (${tour})`)

    // Helper to extract last name for matching
    const getLastName = (name: string): string => {
      if (!name) return ''
      const parts = name.toLowerCase().trim().split(' ')
      // Handle Chinese names (surname first)
      const CHINESE_SURNAMES = new Set(['zheng', 'wang', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'wu', 'zhou', 'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'lin', 'he', 'gao', 'luo'])
      if (parts.length > 1 && CHINESE_SURNAMES.has(parts[0])) return parts[0]
      return parts[parts.length - 1]
    }

    // Build a lookup for draw matches by round, deduping by player pair
    const drawByRound: Record<string, any[]> = {}
    const seenInRound: Record<string, Set<string>> = {}
    for (const match of drawMatchesResult.rows) {
      const round = match.round || 'R64'
      if (!drawByRound[round]) {
        drawByRound[round] = []
        seenInRound[round] = new Set()
      }
      // Dedupe by player pair within each round
      const playerKey = [getLastName(match.player_1_name), getLastName(match.player_2_name)].sort().join('|')
      if (seenInRound[round].has(playerKey)) continue
      seenInRound[round].add(playerKey)
      drawByRound[round].push(match)
    }

    // Step 3a-hybrid: Fetch ESPN matches as fallback for missing api-tennis data
    // This handles cases where api-tennis hasn't updated with new round matchups yet
    const espnMatches = await fetchESPNMatches(tournamentSlug, tour)
    console.log(`Found ${espnMatches.length} ESPN matches for ${tournamentSlug} (${tour})`)

    // Track which player pairs exist in which rounds (for deduplication)
    // Map: playerKey -> round where they appear
    const playerRoundMap = new Map<string, string>()
    for (const round of Object.keys(drawByRound)) {
      for (const match of drawByRound[round]) {
        const playerKey = [getLastName(match.player_1_name), getLastName(match.player_2_name)].sort().join('|')
        // If players already in a different round, keep only the later round (more recent)
        const existingRound = playerRoundMap.get(playerKey)
        if (!existingRound) {
          playerRoundMap.set(playerKey, round)
        }
      }
    }

    // Use ESPN to correct round assignments and add missing matches
    // ESPN has accurate round info; api-tennis sometimes has matches in wrong rounds
    let espnAdded = 0
    let espnMoved = 0
    for (const espnMatch of espnMatches) {
      const playerKey = [getLastName(espnMatch.player1), getLastName(espnMatch.player2)].sort().join('|')
      const existingRound = playerRoundMap.get(playerKey)

      // Always clean up duplicates from wrong rounds, even if match exists in correct round
      // Remove this player pair from ALL rounds except the ESPN-specified round
      let removedFromOtherRounds = false
      for (const round of Object.keys(drawByRound)) {
        if (round === espnMatch.round) continue
        const before = drawByRound[round].length
        drawByRound[round] = drawByRound[round].filter(m => {
          const mKey = [getLastName(m.player_1_name), getLastName(m.player_2_name)].sort().join('|')
          return mKey !== playerKey
        })
        if (drawByRound[round].length < before) removedFromOtherRounds = true
      }

      // If match already exists in the correct round, we're done (just cleaned up duplicates)
      if (existingRound === espnMatch.round) {
        if (removedFromOtherRounds) espnMoved++
        continue
      }

      // If match exists in a DIFFERENT round, we need to add it to the correct round
      // (duplicates were already removed above)
      if (existingRound && existingRound !== espnMatch.round) {
        if (!drawByRound[espnMatch.round]) {
          drawByRound[espnMatch.round] = []
        }
        // Check if match already exists in target round with correct player names
        const existsInTarget = drawByRound[espnMatch.round].some(m => {
          const mKey = [getLastName(m.player_1_name), getLastName(m.player_2_name)].sort().join('|')
          return mKey === playerKey
        })
        if (!existsInTarget) {
          // Add ESPN entry (even for finished - to fix corrupted api-tennis data)
          drawByRound[espnMatch.round].unshift({
            match_key: `espn_${playerKey}_${espnMatch.round}`,
            round: espnMatch.round,
            player_1_name: espnMatch.player1,
            player_2_name: espnMatch.player2,
            status: espnMatch.status === 'live' ? 'live' : (espnMatch.status === 'finished' ? 'finished' : 'upcoming'),
            winner_name: espnMatch.status === 'finished' ? espnMatch.player1 : null, // ESPN lists winner first for finished
            final_result: null,
            source: 'espn'
          })
          espnAdded++
        }
        playerRoundMap.set(playerKey, espnMatch.round)
        continue
      }

      // No existing match - add new ESPN match (for upcoming/live matches only)
      if (espnMatch.status === 'finished') continue

      if (!drawByRound[espnMatch.round]) {
        drawByRound[espnMatch.round] = []
      }

      drawByRound[espnMatch.round].unshift({
        match_key: `espn_${playerKey}_${espnMatch.round}`,
        round: espnMatch.round,
        player_1_name: espnMatch.player1,
        player_2_name: espnMatch.player2,
        status: espnMatch.status === 'live' ? 'live' : 'upcoming',
        winner_name: null,
        final_result: null,
        source: 'espn'
      })

      playerRoundMap.set(playerKey, espnMatch.round)
      espnAdded++
    }

    if (espnAdded > 0 || espnMoved > 0) {
      console.log(`ESPN: added ${espnAdded} matches, moved ${espnMoved} to correct rounds`)
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
    // WTA 1000 events (like Miami) are 128-draw, ATP Masters are 96-draw
    let drawSize = getDrawSize(tourneyLevel, tournamentInfo?.draw_size)
    if (tour === 'WTA' && tourneyLevel === 'M') {
      drawSize = 128  // WTA 1000 events are 128-draw
    } else if (tour === 'ATP' && tourneyLevel === 'M') {
      drawSize = 96   // ATP Masters 1000 are 96-draw
    }
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


    // Build prediction lookup by players using LAST NAME matching
    // "J. Duckworth" -> "duckworth", "James Duckworth" -> "duckworth"
    // Handle Chinese names: "Yibing Wu" -> "wu", "Y. Wu" -> "wu", "Zheng Qinwen" -> "zheng"
    // Common Chinese surnames that appear FIRST in Western order (ESPN uses "Zheng Qinwen")
    const CHINESE_SURNAMES = new Set([
      'zheng', 'wang', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'wu', 'zhou',
      'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'lin', 'he', 'gao', 'luo', 'peng', 'yuan',
      'li', 'lu', 'han', 'shi', 'yuan', 'bai', 'xie', 'zeng', 'shen', 'qiu', 'wen'
    ])

    const extractLastName = (name: string): string => {
      if (!name) return ''
      const clean = name.toLowerCase().trim().replace(/[-.]/g, ' ').replace(/\s+/g, ' ')
      const parts = clean.split(' ')

      // If first part is a known Chinese surname, use it (handles "Zheng Qinwen")
      const firstPart = parts[0]
      if (parts.length > 1 && CHINESE_SURNAMES.has(firstPart)) {
        return firstPart
      }

      // If last part is short (1-2 chars like "Wu"), it's likely a Chinese surname - use it
      const lastPart = parts[parts.length - 1]
      if (lastPart && lastPart.length <= 3 && parts.length > 1) {
        return lastPart
      }

      // Otherwise get the last substantial part (>2 chars)
      return parts.filter(p => p.length > 2).pop() || lastPart || ''
    }

    // Create match key from two last names (sorted for order independence)
    const makeMatchKey = (name1: string, name2: string, round: string): string => {
      const ln1 = extractLastName(name1)
      const ln2 = extractLastName(name2)
      return [ln1, ln2].sort().join('|') + '|' + round
    }

    // Also create partial key (first 5 chars of each name) for fuzzy matching
    const makePartialKey = (name1: string, name2: string, round: string): string => {
      const ln1 = extractLastName(name1).slice(0, 5)
      const ln2 = extractLastName(name2).slice(0, 5)
      return [ln1, ln2].sort().join('|') + '|' + round
    }

    // Round-agnostic key for when ESPN and api-tennis disagree on rounds
    const makePlayerOnlyKey = (name1: string, name2: string): string => {
      const ln1 = extractLastName(name1)
      const ln2 = extractLastName(name2)
      return [ln1, ln2].sort().join('|')
    }

    // Map rounds to equivalent rounds based on draw size differences
    // ESPN might call it "Round 2" (R64 for 128-draw) but api-tennis calls it R32 (for 64-draw view)
    const getEquivalentRounds = (round: string): string[] => {
      const equivalents: Record<string, string[]> = {
        'R128': ['R128', 'R64'],     // R128 in 128-draw = R64 in 64-draw
        'R64': ['R64', 'R32', 'R128'], // R64 could be R32 in smaller draw or R128 in larger
        'R32': ['R32', 'R16', 'R64'], // R32 could be R16 or R64 depending on draw
        'R16': ['R16', 'R32', 'QF'],  // Similar flexibility
        'QF': ['QF'],
        'SF': ['SF'],
        'F': ['F']
      }
      return equivalents[round] || [round]
    }

    const predictionLookup: Record<string, any> = {}
    const partialLookup: Record<string, any> = {}
    const playerOnlyLookup: Record<string, any> = {}  // Fallback: match by players only
    for (const round of Object.keys(predictionsByRound)) {
      for (const pred of predictionsByRound[round]) {
        // Add to primary lookup
        const key = makeMatchKey(pred.player1_name, pred.player2_name, round)
        predictionLookup[key] = pred

        // Also add to equivalent round lookups for draw size flexibility
        for (const equivRound of getEquivalentRounds(round)) {
          if (equivRound !== round) {
            const equivKey = makeMatchKey(pred.player1_name, pred.player2_name, equivRound)
            if (!predictionLookup[equivKey]) predictionLookup[equivKey] = pred
          }
        }

        const partialKey = makePartialKey(pred.player1_name, pred.player2_name, round)
        if (!partialLookup[partialKey]) partialLookup[partialKey] = pred
        // Player-only lookup (no round) - use most recent prediction if multiple
        const playerKey = makePlayerOnlyKey(pred.player1_name, pred.player2_name)
        playerOnlyLookup[playerKey] = pred
      }
    }

    for (let roundIndex = 0; roundIndex < config.rounds.length; roundIndex++) {
      const roundName = config.rounds[roundIndex]
      const matchCount = config.matchCounts[roundName]
      const drawMatches = drawByRound[roundName] || []
      const roundPredictions = predictionsByRound[roundName] || []
      const matches: MatchSlot[] = []

      // Bye heuristic: if first round has some matches but not all slots filled,
      // the empty slots are likely byes (seeded players advancing without playing)
      const isFirstRound = roundIndex === 0
      const hasPartialDraw = drawMatches.length > 0 && drawMatches.length < matchCount

      // Track which predictions have been used (for no-draw-data case)
      let predictionIndex = 0

      for (let slot = 0; slot < matchCount; slot++) {
        const drawMatch = drawMatches[slot]
        let prediction: any = null

        // If we have draw data, find matching prediction by last names
        if (drawMatch) {
          const lookupKey = makeMatchKey(drawMatch.player_1_name, drawMatch.player_2_name, roundName)
          prediction = predictionLookup[lookupKey]
          // Try partial match (first 5 chars) as fallback for spelling variations
          if (!prediction) {
            const partialKey = makePartialKey(drawMatch.player_1_name, drawMatch.player_2_name, roundName)
            prediction = partialLookup[partialKey]
          }
          // Final fallback: match by player names only (ignore round)
          // This handles cases where ESPN and api-tennis use different round naming
          if (!prediction) {
            const playerKey = makePlayerOnlyKey(drawMatch.player_1_name, drawMatch.player_2_name)
            prediction = playerOnlyLookup[playerKey]
          }
        } else if (drawMatches.length === 0 && predictionIndex < roundPredictions.length) {
          // No draw data for this round - use predictions in order
          prediction = roundPredictions[predictionIndex]
          predictionIndex++
        }

        if (drawMatch) {
          // We have draw data from api-tennis.com
          const player1 = drawMatch.player_1_name
          const player2 = drawMatch.player_2_name

          if (drawMatch.status === 'finished' && drawMatch.winner_name) {
            // Completed match from draw
            // Use last-name matching to determine loser (handles name format variations like "D. Yastremska" vs "Dayana Yastremska")
            const winnerLast = extractLastName(drawMatch.winner_name)
            const player1Last = extractLastName(player1)
            const player2Last = extractLastName(player2)
            const loser = winnerLast === player1Last ? player2 : player1

            // Determine which player was predicted to win using last-name matching
            let predictedWinnerDisplay = prediction?.predicted_winner
            // TRUST the database 'correct' value from reconciliation if available
            // Only recalculate if database value is null (not yet reconciled)
            let predictionCorrect = prediction?.correct
            if (prediction) {
              const predWinnerLast = extractLastName(prediction.predicted_winner)
              const player1Last = extractLastName(player1)
              const player2Last = extractLastName(player2)
              if (predWinnerLast === player1Last) {
                predictedWinnerDisplay = player1
              } else if (predWinnerLast === player2Last) {
                predictedWinnerDisplay = player2
              }
              // Only recalculate if database value is null (fallback for unreconciled matches)
              if (predictionCorrect === null || predictionCorrect === undefined) {
                const winnerLast = extractLastName(drawMatch.winner_name)
                predictionCorrect = predWinnerLast === winnerLast
              }
            }

            matches.push({
              slot: slot + 1,
              status: 'completed',
              player1: drawMatch.winner_name,
              player2: loser,
              winner: drawMatch.winner_name,
              score: drawMatch.final_result || undefined,
              prediction: prediction ? {
                predicted_winner: predictedWinnerDisplay,
                confidence: prediction.predicted_prob || 0.5,
                tier: getConfidenceTier(prediction.predicted_prob || 0.5),
                correct: predictionCorrect
              } : undefined,
              // Only show first_set if we have real data (first_set_winner populated)
              first_set: (prediction?.first_set_score && prediction?.first_set_winner) ? {
                predicted_winner: prediction.first_set_winner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: Boolean(prediction.first_set_winner && prediction.predicted_winner && prediction.first_set_winner !== prediction.predicted_winner),
                score_correct: prediction.first_set_score_correct === true
              } : undefined
            })
          } else if (prediction) {
            // Have both draw and prediction - show as predicted
            const fsWinner = prediction.first_set_winner
            const matchWinner = prediction.predicted_winner

            // Determine which player (1 or 2) is predicted to win using last-name matching
            const predWinnerLast = extractLastName(matchWinner)
            const player1Last = extractLastName(player1)
            const player2Last = extractLastName(player2)
            const predictedWinnerSlot = predWinnerLast === player1Last ? 1 : predWinnerLast === player2Last ? 2 : 0

            matches.push({
              slot: slot + 1,
              status: 'predicted',
              player1,
              player2,
              prediction: {
                predicted_winner: predictedWinnerSlot === 1 ? player1 : predictedWinnerSlot === 2 ? player2 : prediction.predicted_winner,
                predicted_winner_slot: predictedWinnerSlot,
                confidence: prediction.predicted_prob || 0.5,
                tier: getConfidenceTier(prediction.predicted_prob || 0.5)
              },
              // Only include first_set if we have REAL data (first_set_winner populated)
              // Empty first_set_winner with "6-4" score is placeholder data - don't show
              first_set: (prediction.first_set_score && prediction.first_set_winner) ? {
                predicted_winner: fsWinner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: Boolean(fsWinner && matchWinner && fsWinner !== matchWinner)
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
                tier: getConfidenceTier(prediction.predicted_prob || 0.5),
                correct: prediction.correct
              },
              // Only show first_set if we have real data (first_set_winner populated)
              first_set: (prediction.first_set_score && prediction.first_set_winner) ? {
                predicted_winner: prediction.first_set_winner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: Boolean(prediction.first_set_winner && prediction.predicted_winner && prediction.first_set_winner !== prediction.predicted_winner),
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
                tier: getConfidenceTier(prediction.predicted_prob || 0.5)
              },
              // Only include first_set if we have REAL data (first_set_winner populated)
              // Empty first_set_winner with "6-4" score is placeholder data - don't show
              first_set: (prediction.first_set_score && prediction.first_set_winner) ? {
                predicted_winner: fsWinner,
                predicted_score: prediction.first_set_score,
                tiebreak_pct: Math.round((prediction.first_set_tiebreak_prob || 0.15) * 100),
                over_under: (prediction.first_set_over_9_5_prob || 0.5) > 0.5 ? 'Over 9.5' : 'Under 9.5',
                divergence: Boolean(fsWinner && matchWinner && fsWinner !== matchWinner)
              } : undefined
            })
          }
        } else {
          // No draw data for this slot
          // If first round has partial data, remaining slots are likely byes
          if (isFirstRound && hasPartialDraw) {
            matches.push({
              slot: slot + 1,
              status: 'bye',
              player1: 'Bye',
              player2: 'Bye'
            })
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
