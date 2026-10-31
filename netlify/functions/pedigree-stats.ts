import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'
import { parseSessionFromCookies } from './auth-utils.js'

/**
 * Live track record for the Pedigree page.
 *
 * The page used to render a hard-coded BACKTEST_STATS object claiming 87.1%
 * for ATP STRONG and 94.8% for WTA STRONG "across 364,000+ matches". Nothing
 * computed those, and they did not survive contact with the prediction log:
 * ASHE has issued exactly one STRONG pick and no WTA STRONG picks at all.
 * Anyone comparing the page to the draws would notice, so the page now shows
 * what actually happened, sample sizes included.
 *
 * Separate from accuracy-stats, which stays admin-only: this returns only the
 * scoreboard a subscriber is entitled to see, not the operational counters.
 */

const MIN_SAMPLE = 30

interface TierRow {
  tier: string
  tour: string
  total: number
  correct: number
  accuracy: number | null
  reliable: boolean
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // The Pedigree page is behind the login, so this is too.
  const session = parseSessionFromCookies(event.headers.cookie)
  if (!session) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Sign in to view the track record' }),
    }
  }

  try {
    const pool = getPool()

    const graded = `
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND confidence_tier <> 'VOID'
        AND actual_winner IS NOT NULL
    `

    const [tierResult, overallResult, firstSetResult, rangeResult] = await Promise.all([
      pool.query(`
        SELECT confidence_tier AS tier,
               COALESCE(tour, 'ATP') AS tour,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE correct) AS correct
        ${graded}
        GROUP BY 1, 2
      `),
      pool.query(`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE correct) AS correct ${graded}
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE first_set_correct IS NOT NULL) AS winner_total,
          COUNT(*) FILTER (WHERE first_set_correct) AS winner_correct,
          COUNT(*) FILTER (WHERE first_set_score_correct IS NOT NULL) AS score_total,
          COUNT(*) FILTER (WHERE first_set_score_correct) AS score_correct
        ${graded}
      `),
      pool.query(`
        SELECT MIN(prediction_date) AS first, MAX(prediction_date) AS last ${graded}
      `),
    ])

    const pct = (correct: number, total: number) =>
      total > 0 ? Math.round((correct / total) * 1000) / 10 : null

    const byTier: TierRow[] = tierResult.rows.map(row => {
      const total = parseInt(row.total, 10)
      const correct = parseInt(row.correct, 10)
      return {
        tier: row.tier,
        tour: row.tour,
        total,
        correct,
        accuracy: pct(correct, total),
        // One correct pick out of one is not 100% accuracy, and the page must
        // not imply it is.
        reliable: total >= MIN_SAMPLE,
      }
    })

    const overall = overallResult.rows[0] || {}
    const fs = firstSetResult.rows[0] || {}
    const range = rangeResult.rows[0] || {}
    const num = (v: unknown) => parseInt(String(v ?? '0'), 10) || 0

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        minSample: MIN_SAMPLE,
        byTier,
        overall: {
          total: num(overall.total),
          correct: num(overall.correct),
          accuracy: pct(num(overall.correct), num(overall.total)),
        },
        firstSet: {
          winner: {
            total: num(fs.winner_total),
            accuracy: pct(num(fs.winner_correct), num(fs.winner_total)),
          },
          exactScore: {
            total: num(fs.score_total),
            accuracy: pct(num(fs.score_correct), num(fs.score_total)),
          },
        },
        range: {
          first: range.first ? new Date(range.first).toISOString().slice(0, 10) : null,
          last: range.last ? new Date(range.last).toISOString().slice(0, 10) : null,
        },
      }),
    }
  } catch (error) {
    console.error('pedigree-stats failed:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Could not load the track record' }),
    }
  }
}

export { handler }
