/**
 * Health rules for the cron watchdog, kept pure so they can be tested.
 *
 * They were inline in watchdog-background.mts, which is how the draw sync
 * managed to be dead for 58 days while the watchdog reported healthy: the
 * staleness alarm was written as
 *
 *     if (hoursSinceDrawSync > 3 && predictions_today > 0)
 *
 * so it only fired on days the prediction cron had already produced
 * something. When the draw feed died on 1 September the predictions thinned
 * out too, and each failure suppressed the alarm for the other. Nothing in
 * 2,357 consecutive zero-row syncs ever raised a flag.
 */

export interface CronStatus {
  predictions_today?: number
  unreconciled_3d?: number
  last_successful_runs?: Record<string, string | null>
  data_freshness?: {
    last_reconcile?: string | null
    last_draw_sync?: string | null
  }
}

export interface HealthVerdict {
  healthy: boolean
  message: string
  details: Record<string, unknown>
}

/** No stretch of the tennis calendar leaves the draws untouched this long. */
export const DRAW_SYNC_DEAD_HOURS = 48
/** During an active event the sync writes every ~30 minutes. */
export const DRAW_SYNC_STALE_HOURS = 3
export const RECONCILE_STALE_HOURS = 6
export const ALL_STALLED_HOURS = 24
export const UNRECONCILED_LIMIT = 50

const hoursSince = (iso: string | null | undefined, now: number): number => {
  if (!iso) return Infinity
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return Infinity
  return (now - then) / 3.6e6
}

export function evaluateCronHealth(data: CronStatus, now: number = Date.now()): HealthVerdict {
  const freshness = data.data_freshness || {}
  const unreconciled = data.unreconciled_3d || 0
  const predictionsToday = data.predictions_today || 0

  const sinceReconcile = hoursSince(freshness.last_reconcile, now)
  const sinceDrawSync = hoursSince(freshness.last_draw_sync, now)

  const candidates: number[] = []
  for (const lastRun of Object.values(data.last_successful_runs || {})) {
    if (lastRun) {
      const t = new Date(lastRun).getTime()
      if (Number.isFinite(t)) candidates.push(t)
    }
  }
  for (const iso of [freshness.last_reconcile, freshness.last_draw_sync]) {
    if (iso) {
      const t = new Date(iso).getTime()
      if (Number.isFinite(t)) candidates.push(t)
    }
  }

  const details = { sinceReconcile, sinceDrawSync, unreconciled, predictionsToday, freshness }

  // A draw feed that has written nothing for days is broken whether or not
  // anything else ran. This check answers to nothing else — that conjunction
  // is what hid the outage.
  if (sinceDrawSync > DRAW_SYNC_DEAD_HOURS) {
    const age = sinceDrawSync === Infinity
      ? 'never'
      : `${Math.floor(sinceDrawSync / 24)}d`
    return {
      healthy: false,
      message: `Draw sync DEAD: draw_matches last written ${age} ago. Check the api-tennis.com subscription.`,
      details,
    }
  }

  if (candidates.length === 0) {
    return { healthy: false, message: 'No cron history or data-freshness signals', details }
  }

  const sinceAnything = (now - Math.max(...candidates)) / 3.6e6
  if (sinceAnything > ALL_STALLED_HOURS) {
    return {
      healthy: false,
      message: `Crons stale: ${sinceAnything.toFixed(0)}h since last activity`,
      details: { ...details, sinceAnything },
    }
  }

  // The tighter in-event threshold still needs predictions as its signal that
  // an event is running, but it can no longer be the only draw-sync alarm.
  if (sinceDrawSync > DRAW_SYNC_STALE_HOURS && predictionsToday > 0) {
    return {
      healthy: false,
      message: `Draw sync stale: ${sinceDrawSync.toFixed(1)}h since draw_matches updated`,
      details,
    }
  }

  if (sinceReconcile > RECONCILE_STALE_HOURS) {
    return {
      healthy: false,
      message: `Reconciliation stale: ${sinceReconcile.toFixed(1)}h since last reconcile`,
      details,
    }
  }

  if (unreconciled > UNRECONCILED_LIMIT) {
    return {
      healthy: false,
      message: `Reconciliation backlog: ${unreconciled} unreconciled`,
      details,
    }
  }

  return {
    healthy: true,
    message: `Crons OK (${sinceAnything.toFixed(1)}h ago, ${unreconciled} unreconciled, `
      + `draws ${sinceDrawSync.toFixed(1)}h, reconcile ${sinceReconcile.toFixed(1)}h)`,
    details,
  }
}
