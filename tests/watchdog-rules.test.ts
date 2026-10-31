import { describe, it, expect } from 'vitest'
import {
  evaluateCronHealth,
  DRAW_SYNC_DEAD_HOURS,
  type CronStatus,
} from '../netlify/functions/watchdog-rules'

const NOW = new Date('2026-10-31T07:00:00Z').getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 3.6e6).toISOString()

const healthy = (over: Partial<CronStatus> = {}): CronStatus => ({
  predictions_today: 40,
  unreconciled_3d: 3,
  last_successful_runs: { 'auto-reconcile': hoursAgo(1), 'daily-predictions': hoursAgo(2) },
  data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(0.5) },
  ...over,
})

describe('evaluateCronHealth', () => {
  it('passes a system that is actually working', () => {
    const verdict = evaluateCronHealth(healthy(), NOW)
    expect(verdict.healthy).toBe(true)
    expect(verdict.message).toMatch(/Crons OK/)
  })
})

/**
 * The outage this rule was written for. On 2026-10-31 /cron/status reported
 * exactly this: draw_matches last written on 3 September, no predictions yet
 * that day. The old rule read `hoursSinceDrawSync > 3 && predictions_today > 0`
 * and so said nothing, for 58 days.
 */
describe('the 58-day draw outage that went unreported', () => {
  const outage: CronStatus = {
    predictions_today: 0,
    unreconciled_3d: 10,
    last_successful_runs: {
      'auto-reconcile': '2026-10-30T23:32:21.899937Z',
      'daily-predictions': '2026-10-30T23:32:20.228552Z',
    },
    data_freshness: {
      last_reconcile: '2026-10-31T00:30:19.116198Z',
      last_draw_sync: '2026-09-03T22:20:02.998167+00:00',
    },
  }

  it('is reported unhealthy', () => {
    expect(evaluateCronHealth(outage, NOW).healthy).toBe(false)
  })

  it('says what died and how long ago', () => {
    const { message } = evaluateCronHealth(outage, NOW)
    expect(message).toMatch(/Draw sync DEAD/)
    expect(message).toMatch(/57d/)
  })

  it('points at the cause a human has to act on', () => {
    expect(evaluateCronHealth(outage, NOW).message).toMatch(/api-tennis\.com subscription/)
  })

  it('fires whether or not predictions ran that day', () => {
    // The conjunction that hid it: either value of predictions_today must alarm.
    for (const predictions_today of [0, 40]) {
      expect(evaluateCronHealth({ ...outage, predictions_today }, NOW).healthy).toBe(false)
    }
  })

  it('fires even while every other signal looks fine', () => {
    const everythingElseFine: CronStatus = {
      ...healthy(),
      data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(60 * 24) },
    }
    const verdict = evaluateCronHealth(everythingElseFine, NOW)
    expect(verdict.healthy).toBe(false)
    expect(verdict.message).toMatch(/Draw sync DEAD/)
  })
})

describe('draw sync thresholds', () => {
  it('tolerates a gap between tournaments', () => {
    // 36h with no play is a normal Monday, not an outage.
    const quiet = healthy({
      predictions_today: 0,
      data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(36) },
    })
    expect(evaluateCronHealth(quiet, NOW).healthy).toBe(true)
  })

  it('calls it dead just past the threshold', () => {
    const justUnder = healthy({
      predictions_today: 0,
      data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(DRAW_SYNC_DEAD_HOURS - 1) },
    })
    const justOver = healthy({
      predictions_today: 0,
      data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(DRAW_SYNC_DEAD_HOURS + 1) },
    })
    expect(evaluateCronHealth(justUnder, NOW).healthy).toBe(true)
    expect(evaluateCronHealth(justOver, NOW).healthy).toBe(false)
  })

  it('still catches a mid-event stall within hours', () => {
    const stalled = healthy({
      predictions_today: 40,
      data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: hoursAgo(5) },
    })
    const verdict = evaluateCronHealth(stalled, NOW)
    expect(verdict.healthy).toBe(false)
    expect(verdict.message).toMatch(/Draw sync stale/)
  })

  it('treats a draw sync that has never run as dead, not as fine', () => {
    const never = healthy({ data_freshness: { last_reconcile: hoursAgo(1), last_draw_sync: null } })
    const verdict = evaluateCronHealth(never, NOW)
    expect(verdict.healthy).toBe(false)
    expect(verdict.message).toMatch(/never/)
  })
})

describe('the other rules still hold', () => {
  it('flags a total stall', () => {
    const stalled: CronStatus = {
      predictions_today: 0,
      unreconciled_3d: 0,
      last_successful_runs: { 'auto-reconcile': hoursAgo(30) },
      data_freshness: { last_reconcile: hoursAgo(30), last_draw_sync: hoursAgo(30) },
    }
    expect(evaluateCronHealth(stalled, NOW).message).toMatch(/Crons stale/)
  })

  it('flags stale reconciliation', () => {
    const verdict = evaluateCronHealth(healthy({
      data_freshness: { last_reconcile: hoursAgo(8), last_draw_sync: hoursAgo(0.5) },
    }), NOW)
    expect(verdict.healthy).toBe(false)
    expect(verdict.message).toMatch(/Reconciliation stale/)
  })

  it('flags a reconciliation backlog', () => {
    const verdict = evaluateCronHealth(healthy({ unreconciled_3d: 120 }), NOW)
    expect(verdict.healthy).toBe(false)
    expect(verdict.message).toMatch(/backlog: 120/)
  })

  it('reports an empty status document rather than passing it', () => {
    expect(evaluateCronHealth({}, NOW).healthy).toBe(false)
  })

  it('does not trust an unparseable timestamp', () => {
    const verdict = evaluateCronHealth(healthy({
      data_freshness: { last_reconcile: 'not a date', last_draw_sync: 'also not a date' },
    }), NOW)
    expect(verdict.healthy).toBe(false)
  })
})
