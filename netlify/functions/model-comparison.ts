import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getPool } from './db'

interface ModelStats {
  modelName: string
  modelVersion: string
  totalPredictions: number
  fsWinner: {
    total: number
    correct: number
    accuracy: number
  }
  fsScore: {
    total: number
    correct: number
    accuracy: number
  }
  fsOverUnder: {
    total: number
    correct: number
    accuracy: number
  }
  byScoreCategory: {
    [score: string]: {
      predicted: number
      correct: number
      accuracy: number
    }
  }
  calibration: Array<{
    bucket: number
    predictedProb: number
    actualProb: number
    count: number
  }>
  isProduction: boolean
}

interface ModelComparisonResponse {
  stats: ModelStats[]
  summary: {
    totalMatches: number
    dateRange: {
      start: string
      end: string
    }
  }
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

    // Parse query params
    const params = event.queryStringParameters || {}
    const days = parseInt(params.days || '30')
    const tour = params.tour || null

    // Build WHERE clause
    const whereConditions = [
      'reconciled_at IS NOT NULL',
      `prediction_date >= CURRENT_DATE - INTERVAL '${days} days'`
    ]
    if (tour) {
      whereConditions.push(`tour = '${tour}'`)
    }
    const whereClause = whereConditions.join(' AND ')

    // Get accuracy by model
    const modelResult = await pool.query(`
      SELECT
        mp.model_name,
        mp.model_version,
        COUNT(*) as total_predictions,
        COUNT(*) FILTER (WHERE fs_winner_correct IS NOT NULL) as fs_winner_total,
        COUNT(*) FILTER (WHERE fs_winner_correct = true) as fs_winner_correct,
        COUNT(*) FILTER (WHERE fs_score_correct IS NOT NULL) as fs_score_total,
        COUNT(*) FILTER (WHERE fs_score_correct = true) as fs_score_correct,
        COUNT(*) FILTER (WHERE fs_over_9_5_correct IS NOT NULL) as fs_ou_total,
        COUNT(*) FILTER (WHERE fs_over_9_5_correct = true) as fs_ou_correct,
        COALESCE(mr.is_production, false) as is_production
      FROM model_predictions mp
      LEFT JOIN model_registry mr ON mp.model_name = mr.model_name
      WHERE ${whereClause}
      GROUP BY mp.model_name, mp.model_version, mr.is_production
      ORDER BY
        CASE WHEN mr.is_production THEN 0 ELSE 1 END,
        mp.model_name
    `)

    // Get score category breakdown by model
    const scoreCategoryResult = await pool.query(`
      SELECT
        model_name,
        fs_predicted_score,
        COUNT(*) as predicted,
        COUNT(*) FILTER (WHERE fs_score_correct = true) as correct
      FROM model_predictions
      WHERE ${whereClause}
        AND fs_predicted_score IS NOT NULL
      GROUP BY model_name, fs_predicted_score
      ORDER BY model_name, fs_predicted_score
    `)

    // Get calibration data (actual vs predicted probability by bucket)
    const calibrationResult = await pool.query(`
      SELECT
        model_name,
        confidence_bucket,
        COUNT(*) as count,
        AVG(fs_winner_prob) as avg_predicted_prob,
        AVG(CASE WHEN fs_winner_correct = true THEN 1.0 ELSE 0.0 END) as actual_prob
      FROM model_predictions
      WHERE ${whereClause}
        AND confidence_bucket IS NOT NULL
        AND fs_winner_correct IS NOT NULL
      GROUP BY model_name, confidence_bucket
      ORDER BY model_name, confidence_bucket
    `)

    // Get date range
    const dateRangeResult = await pool.query(`
      SELECT
        MIN(prediction_date) as start_date,
        MAX(prediction_date) as end_date,
        COUNT(DISTINCT prediction_date || player_a_id || player_b_id) as total_matches
      FROM model_predictions
      WHERE ${whereClause}
    `)

    // Build model stats
    const stats: ModelStats[] = modelResult.rows.map(row => {
      const modelName = row.model_name

      // Get score categories for this model
      const scoreCategories: { [score: string]: { predicted: number; correct: number; accuracy: number } } = {}
      scoreCategoryResult.rows
        .filter(r => r.model_name === modelName)
        .forEach(r => {
          const predicted = parseInt(r.predicted)
          const correct = parseInt(r.correct)
          scoreCategories[r.fs_predicted_score] = {
            predicted,
            correct,
            accuracy: predicted > 0 ? Math.round((correct / predicted) * 1000) / 10 : 0
          }
        })

      // Get calibration for this model
      const calibration = calibrationResult.rows
        .filter(r => r.model_name === modelName)
        .map(r => ({
          bucket: parseInt(r.confidence_bucket),
          predictedProb: Math.round(parseFloat(r.avg_predicted_prob) * 100),
          actualProb: Math.round(parseFloat(r.actual_prob) * 100),
          count: parseInt(r.count)
        }))

      const fsWinnerTotal = parseInt(row.fs_winner_total)
      const fsWinnerCorrect = parseInt(row.fs_winner_correct)
      const fsScoreTotal = parseInt(row.fs_score_total)
      const fsScoreCorrect = parseInt(row.fs_score_correct)
      const fsOuTotal = parseInt(row.fs_ou_total)
      const fsOuCorrect = parseInt(row.fs_ou_correct)

      return {
        modelName,
        modelVersion: row.model_version,
        totalPredictions: parseInt(row.total_predictions),
        fsWinner: {
          total: fsWinnerTotal,
          correct: fsWinnerCorrect,
          accuracy: fsWinnerTotal > 0 ? Math.round((fsWinnerCorrect / fsWinnerTotal) * 1000) / 10 : 0
        },
        fsScore: {
          total: fsScoreTotal,
          correct: fsScoreCorrect,
          accuracy: fsScoreTotal > 0 ? Math.round((fsScoreCorrect / fsScoreTotal) * 1000) / 10 : 0
        },
        fsOverUnder: {
          total: fsOuTotal,
          correct: fsOuCorrect,
          accuracy: fsOuTotal > 0 ? Math.round((fsOuCorrect / fsOuTotal) * 1000) / 10 : 0
        },
        byScoreCategory: scoreCategories,
        calibration,
        isProduction: row.is_production
      }
    })

    const response: ModelComparisonResponse = {
      stats,
      summary: {
        totalMatches: parseInt(dateRangeResult.rows[0]?.total_matches || '0'),
        dateRange: {
          start: dateRangeResult.rows[0]?.start_date || '',
          end: dateRangeResult.rows[0]?.end_date || ''
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...response
      })
    }
  } catch (error) {
    console.error('Error fetching model comparison:', error)
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
