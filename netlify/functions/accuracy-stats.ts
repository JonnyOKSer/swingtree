import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

interface TierStats {
  tier: string
  total: number
  correct: number
  incorrect: number
  accuracy: number
}

interface AccuracyStats {
  byTier: TierStats[]
  overall: {
    total: number
    correct: number
    incorrect: number
    accuracy: number
  }
  firstSetWinner: {
    total: number
    correct: number
    accuracy: number
  }
  firstSetScore: {
    total: number
    correct: number
    accuracy: number
  }
  pending: number
  voided: number
  lastReconciliation: string | null
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
    const pool = getPool()

    // Get accuracy by tier
    const tierResult = await pool.query(`
      SELECT
        confidence_tier as tier,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE correct = true) as correct,
        COUNT(*) FILTER (WHERE correct = false) as incorrect
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND confidence_tier <> 'VOID'
        AND actual_winner IS NOT NULL
      GROUP BY confidence_tier
      ORDER BY
        CASE confidence_tier
          WHEN 'STRONG' THEN 1
          WHEN 'CONFIDENT' THEN 2
          WHEN 'PICK' THEN 3
          WHEN 'LEAN' THEN 4
          WHEN 'SKIP' THEN 5
          ELSE 6
        END
    `)

    const byTier: TierStats[] = tierResult.rows.map(row => ({
      tier: row.tier,
      total: parseInt(row.total),
      correct: parseInt(row.correct),
      incorrect: parseInt(row.incorrect),
      accuracy: parseInt(row.total) > 0
        ? Math.round((parseInt(row.correct) / parseInt(row.total)) * 1000) / 10
        : 0
    }))

    // Calculate overall stats
    const overallTotal = byTier.reduce((sum, t) => sum + t.total, 0)
    const overallCorrect = byTier.reduce((sum, t) => sum + t.correct, 0)
    const overallIncorrect = byTier.reduce((sum, t) => sum + t.incorrect, 0)

    // Get first set winner accuracy
    const fsWinnerResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE first_set_correct IS NOT NULL) as total,
        COUNT(*) FILTER (WHERE first_set_correct = true) as correct
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND confidence_tier <> 'VOID'
        AND actual_winner IS NOT NULL
    `)

    const fsWinnerTotal = parseInt(fsWinnerResult.rows[0]?.total || '0')
    const fsWinnerCorrect = parseInt(fsWinnerResult.rows[0]?.correct || '0')

    // Get first set exact score accuracy
    const fsScoreResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE first_set_score_correct IS NOT NULL) as total,
        COUNT(*) FILTER (WHERE first_set_score_correct = true) as correct
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
        AND confidence_tier <> 'VOID'
        AND actual_winner IS NOT NULL
    `)

    const fsScoreTotal = parseInt(fsScoreResult.rows[0]?.total || '0')
    const fsScoreCorrect = parseInt(fsScoreResult.rows[0]?.correct || '0')

    // Get pending count
    const pendingResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM prediction_log
      WHERE reconciled_at IS NULL
        AND confidence_tier <> 'VOID'
    `)

    // Get voided count
    const voidedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM prediction_log
      WHERE confidence_tier = 'VOID'
    `)

    // Get last reconciliation timestamp
    const lastReconResult = await pool.query(`
      SELECT MAX(reconciled_at) as last_reconciliation
      FROM prediction_log
      WHERE reconciled_at IS NOT NULL
    `)

    const lastReconciliation = lastReconResult.rows[0]?.last_reconciliation
      ? new Date(lastReconResult.rows[0].last_reconciliation).toISOString()
      : null

    const stats: AccuracyStats = {
      byTier,
      overall: {
        total: overallTotal,
        correct: overallCorrect,
        incorrect: overallIncorrect,
        accuracy: overallTotal > 0
          ? Math.round((overallCorrect / overallTotal) * 1000) / 10
          : 0
      },
      firstSetWinner: {
        total: fsWinnerTotal,
        correct: fsWinnerCorrect,
        accuracy: fsWinnerTotal > 0
          ? Math.round((fsWinnerCorrect / fsWinnerTotal) * 1000) / 10
          : 0
      },
      firstSetScore: {
        total: fsScoreTotal,
        correct: fsScoreCorrect,
        accuracy: fsScoreTotal > 0
          ? Math.round((fsScoreCorrect / fsScoreTotal) * 1000) / 10
          : 0
      },
      pending: parseInt(pendingResult.rows[0]?.count || '0'),
      voided: parseInt(voidedResult.rows[0]?.count || '0'),
      lastReconciliation
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats
      })
    }
  } catch (error) {
    console.error('Error fetching accuracy stats:', error)
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
