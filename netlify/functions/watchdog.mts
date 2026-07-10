/**
 * ASHE Watchdog - External monitoring for Tennis Oracle crons
 *
 * This runs on Netlify (EXTERNAL to Railway) to monitor the Tennis Oracle service.
 * It cannot rely on Railway's cron system since that's what we're monitoring.
 *
 * Schedule: Every 30 minutes (previously 2h — dropped after a July 2026 miss
 * where the 2h cadence let a Railway-cron failure sit uncorrected for hours)
 *
 * Flow:
 * 1. Check if Tennis Oracle service is responding
 * 2. Check if predictions exist for today (after 10:00 UTC)
 * 3. If failures detected, trigger recovery via HTTP endpoint
 * 4. Alert via Discord on persistent failures
 * 5. Track consecutive failures and escalate after 3
 */

import type { Handler, Config } from "@netlify/functions";
import { getPool } from "./db.js";

// Extend function timeout to handle Railway cold starts (can take 40+ seconds)
export const config: Config = {
  schedule: "*/30 * * * *", // Every 30 minutes (also in netlify.toml)
  // Background functions can run up to 15 minutes
};

// Configuration
const TENNIS_ORACLE_URL = process.env.TENNIS_ORACLE_URL || "https://agent-production-765b.up.railway.app";
const TENNIS_ORACLE_API_KEY = process.env.TENNIS_ORACLE_API_KEY || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_ADMIN_WEBHOOK_URL || "";

const MAX_CONSECUTIVE_FAILURES = 3;
const HEALTH_CHECK_TIMEOUT = 60000; // 60 seconds (Railway cold starts can be slow)
const TRIGGER_TIMEOUT = 300000; // 5 minutes

interface WatchdogState {
  consecutive_failures: number;
  last_alert: string | null;
  last_recovery: string | null;
  last_check: string | null;
}

interface CheckResult {
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Database table for persistent state (survives function restarts)
async function getWatchdogState(): Promise<WatchdogState> {
  const pool = getPool();

  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchdog_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        consecutive_failures INTEGER DEFAULT 0,
        last_alert TIMESTAMP,
        last_recovery TIMESTAMP,
        last_check TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (id = 1)
      )
    `);

    const result = await pool.query(`SELECT * FROM watchdog_state WHERE id = 1`);

    if (result.rows.length === 0) {
      // Initialize state
      await pool.query(`
        INSERT INTO watchdog_state (id, consecutive_failures) VALUES (1, 0)
        ON CONFLICT (id) DO NOTHING
      `);
      return { consecutive_failures: 0, last_alert: null, last_recovery: null, last_check: null };
    }

    const row = result.rows[0];
    return {
      consecutive_failures: row.consecutive_failures || 0,
      last_alert: row.last_alert?.toISOString() || null,
      last_recovery: row.last_recovery?.toISOString() || null,
      last_check: row.last_check?.toISOString() || null
    };
  } catch (error) {
    console.error("[WATCHDOG] Failed to get state:", error);
    return { consecutive_failures: 0, last_alert: null, last_recovery: null, last_check: null };
  }
}

async function updateWatchdogState(updates: Partial<WatchdogState>): Promise<void> {
  const pool = getPool();

  try {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: (number | string | null)[] = [];
    let paramIndex = 1;

    if (updates.consecutive_failures !== undefined) {
      setClauses.push(`consecutive_failures = $${paramIndex++}`);
      values.push(updates.consecutive_failures);
    }
    if (updates.last_alert !== undefined) {
      setClauses.push(`last_alert = $${paramIndex++}`);
      values.push(updates.last_alert);
    }
    if (updates.last_recovery !== undefined) {
      setClauses.push(`last_recovery = $${paramIndex++}`);
      values.push(updates.last_recovery);
    }
    if (updates.last_check !== undefined) {
      setClauses.push(`last_check = $${paramIndex++}`);
      values.push(updates.last_check);
    }

    await pool.query(
      `UPDATE watchdog_state SET ${setClauses.join(", ")} WHERE id = 1`,
      values
    );
  } catch (error) {
    console.error("[WATCHDOG] Failed to update state:", error);
  }
}

async function checkServiceHealth(): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

  try {
    const response = await fetch(`${TENNIS_ORACLE_URL}/health`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.status === "healthy") {
        return { healthy: true, message: "Service healthy", details: data };
      }
      return { healthy: false, message: `Service unhealthy: ${JSON.stringify(data)}`, details: data };
    }
    return { healthy: false, message: `HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return { healthy: false, message: "Service timeout - not responding" };
    }
    return { healthy: false, message: `Connection failed: ${error}` };
  }
}

async function checkPredictionStatus(): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

  try {
    const response = await fetch(`${TENNIS_ORACLE_URL}/status`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const predictionCount = data.predictions_today || 0;
      const currentHour = new Date().getUTCHours();

      // After 10:00 UTC (6am EST), we expect predictions
      if (currentHour >= 10) {
        if (predictionCount > 0) {
          return { healthy: true, message: `${predictionCount} predictions today`, details: data };
        }
        return { healthy: false, message: "No predictions for today after 10:00 UTC", details: data };
      }
      // Before 10:00 UTC, no predictions is acceptable
      return { healthy: true, message: `Pre-cron window, ${predictionCount} predictions`, details: data };
    }
    return { healthy: false, message: `Status check failed: HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timeout);
    return { healthy: false, message: `Status check error: ${error}` };
  }
}

async function checkCronHealth(): Promise<CheckResult> {
  // Check if crons are actually running by looking at cron status
  try {
    const response = await fetch(`${TENNIS_ORACLE_URL}/cron/status`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT)
    });

    if (response.ok) {
      const data = await response.json();
      const lastRuns = data.last_successful_runs || {};
      const freshness = data.data_freshness || {};
      const unreconciled = data.unreconciled_3d || 0;

      // Consider both cron_runs entries AND actual data writes.
      // Some Railway crons update tables without logging to cron_runs;
      // trusting the data timestamps catches real staleness accurately.
      const candidates: Date[] = [];
      for (const [, lastRun] of Object.entries(lastRuns)) {
        if (lastRun) candidates.push(new Date(lastRun as string));
      }
      if (freshness.last_reconcile) candidates.push(new Date(freshness.last_reconcile));
      if (freshness.last_draw_sync) candidates.push(new Date(freshness.last_draw_sync));

      const mostRecentRun = candidates.length
        ? new Date(Math.max(...candidates.map(d => d.getTime())))
        : null;

      // Separate freshness readings for granular alerts
      const hoursSinceReconcile = freshness.last_reconcile
        ? (Date.now() - new Date(freshness.last_reconcile).getTime()) / 3.6e6
        : Infinity;
      const hoursSinceDrawSync = freshness.last_draw_sync
        ? (Date.now() - new Date(freshness.last_draw_sync).getTime()) / 3.6e6
        : Infinity;

      if (mostRecentRun) {
        const hoursSince = (Date.now() - mostRecentRun.getTime()) / 3.6e6;

        // If nothing has moved in 24+ hours, everything's stalled
        if (hoursSince > 24) {
          return {
            healthy: false,
            message: `Crons stale: ${hoursSince.toFixed(0)}h since last activity`,
            details: { hoursSince, unreconciled, lastRuns, freshness }
          };
        }

        // Draw sync should touch draw_matches every ~30 min during an event.
        // Alert if it hasn't in 3h+ AND we have predictions today (active event).
        if (hoursSinceDrawSync > 3 && (data.predictions_today || 0) > 0) {
          return {
            healthy: false,
            message: `Draw sync stale: ${hoursSinceDrawSync.toFixed(1)}h since draw_matches updated`,
            details: { hoursSinceDrawSync, hoursSinceReconcile, unreconciled, freshness }
          };
        }

        // Reconciliation should touch prediction_log at least once every 6h.
        if (hoursSinceReconcile > 6) {
          return {
            healthy: false,
            message: `Reconciliation stale: ${hoursSinceReconcile.toFixed(1)}h since last reconcile`,
            details: { hoursSinceReconcile, unreconciled, freshness }
          };
        }

        // If >50 unreconciled predictions in 3 days, reconciliation is stuck
        if (unreconciled > 50) {
          return {
            healthy: false,
            message: `Reconciliation backlog: ${unreconciled} unreconciled`,
            details: { hoursSince, unreconciled, lastRuns, freshness }
          };
        }

        return {
          healthy: true,
          message: `Crons OK (${hoursSince.toFixed(1)}h ago, ${unreconciled} unreconciled, draws ${hoursSinceDrawSync.toFixed(1)}h, reconcile ${hoursSinceReconcile.toFixed(1)}h)`,
          details: { hoursSince, unreconciled, hoursSinceReconcile, hoursSinceDrawSync }
        };
      }

      return { healthy: false, message: "No cron history or data-freshness signals", details: data };
    }
    return { healthy: false, message: `Cron status check failed: HTTP ${response.status}` };
  } catch (error) {
    return { healthy: false, message: `Cron check error: ${error}` };
  }
}

async function triggerRecovery(): Promise<CheckResult> {
  if (!TENNIS_ORACLE_API_KEY) {
    return { healthy: false, message: "No API key configured - cannot trigger recovery" };
  }

  const results: string[] = [];
  let overallSuccess = true;

  // 1. Trigger draw sync first (so predictions have data to work with)
  console.log("  [1/3] Triggering draw sync...");
  try {
    const syncResponse = await fetch(`${TENNIS_ORACLE_URL}/sync-draws`, {
      method: "POST",
      headers: { "X-API-Key": TENNIS_ORACLE_API_KEY },
      signal: AbortSignal.timeout(120000) // 2 min timeout for sync
    });
    if (syncResponse.ok) {
      results.push("draw-sync: success");
    } else {
      results.push(`draw-sync: HTTP ${syncResponse.status}`);
      // Don't fail overall - continue to predictions
    }
  } catch (error) {
    results.push(`draw-sync: ${error}`);
  }

  // 2. Trigger predictions
  console.log("  [2/3] Triggering predictions...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT);

  try {
    const response = await fetch(`${TENNIS_ORACLE_URL}/trigger`, {
      method: "POST",
      headers: { "X-API-Key": TENNIS_ORACLE_API_KEY },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        results.push("predictions: success");
      } else {
        results.push(`predictions: ${JSON.stringify(data)}`);
        overallSuccess = false;
      }
    } else if (response.status === 403) {
      results.push("predictions: in progress (locked)");
    } else {
      results.push(`predictions: HTTP ${response.status}`);
      overallSuccess = false;
    }
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      results.push("predictions: timeout");
    } else {
      results.push(`predictions: ${error}`);
    }
    overallSuccess = false;
  }

  // 3. Trigger reconciliation
  console.log("  [3/3] Triggering reconciliation...");
  try {
    const reconcileResponse = await fetch(`${TENNIS_ORACLE_URL}/reconcile`, {
      method: "POST",
      headers: { "X-API-Key": TENNIS_ORACLE_API_KEY },
      signal: AbortSignal.timeout(120000) // 2 min timeout
    });
    if (reconcileResponse.ok) {
      results.push("reconcile: success");
    } else {
      results.push(`reconcile: HTTP ${reconcileResponse.status}`);
      // Don't fail overall for reconciliation failure
    }
  } catch (error) {
    results.push(`reconcile: ${error}`);
  }

  const message = results.join(", ");
  return {
    healthy: overallSuccess,
    message: overallSuccess ? `Recovery completed: ${message}` : `Recovery partial: ${message}`,
    details: { steps: results }
  };
}

async function sendDiscordAlert(
  title: string,
  message: string,
  color: number = 0xff0000,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log(`[WATCHDOG] Discord not configured - would alert: ${title}`);
    return false;
  }

  const embed = {
    title: `🐕 ASHE Watchdog: ${title}`,
    description: message,
    color,
    timestamp: new Date().toISOString(),
    footer: { text: "ASHE Watchdog | Netlify → Railway" },
    fields: fields || []
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
    return response.status === 204;
  } catch (error) {
    console.error(`[WATCHDOG] Discord alert failed:`, error);
    return false;
  }
}

export const handler: Handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    console.log("\n" + "=".repeat(60));
    console.log(`ASHE WATCHDOG - ${new Date().toISOString()} UTC`);
    console.log("=".repeat(60));

    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      checks: {},
      actions: [],
      overall_healthy: true
    };

    // Load state
    let state = await getWatchdogState();
  console.log(`[STATE] Consecutive failures: ${state.consecutive_failures}`);

  // Step 1: Check service health
  console.log("\n[1/3] Checking service health...");
  const healthResult = await checkServiceHealth();
  results.checks = { ...results.checks as object, service_health: healthResult };
  console.log(`  ${healthResult.healthy ? "✓" : "✗"} ${healthResult.message}`);

  if (!healthResult.healthy) {
    results.overall_healthy = false;
    state.consecutive_failures += 1;

    // Alert on first failure or every 3rd
    if (state.consecutive_failures === 1 || state.consecutive_failures % 3 === 0) {
      await sendDiscordAlert(
        "Service Unreachable",
        `Tennis Oracle service is not responding.\n\n**Error:** ${healthResult.message}\n**Failures:** ${state.consecutive_failures} consecutive`,
        0xff0000
      );
      (results.actions as string[]).push("sent_service_alert");
    }

    await updateWatchdogState({
      consecutive_failures: state.consecutive_failures,
      last_check: new Date().toISOString()
    });

    return {
      statusCode: 503,
      headers,
      body: JSON.stringify(results)
    };
  }

  // Step 2: Check prediction status
  console.log("\n[2/4] Checking prediction status...");
  const predResult = await checkPredictionStatus();
  results.checks = { ...results.checks as object, predictions: predResult };
  console.log(`  ${predResult.healthy ? "✓" : "✗"} ${predResult.message}`);

  // Step 3: Check cron health (are crons actually running?)
  console.log("\n[3/4] Checking cron health...");
  const cronResult = await checkCronHealth();
  results.checks = { ...results.checks as object, cron_health: cronResult };
  console.log(`  ${cronResult.healthy ? "✓" : "✗"} ${cronResult.message}`);

  // Step 4: Determine if recovery is needed
  // Trigger recovery if predictions are missing OR crons are stale
  const needsRecovery = !predResult.healthy || !cronResult.healthy;

  if (needsRecovery) {
    results.overall_healthy = false;
    state.consecutive_failures += 1;
    console.log(`\n[RECOVERY] Failures detected (${state.consecutive_failures} consecutive)`);

    // ALWAYS attempt recovery - don't give up after 3 failures
    // Railway crons can be unreliable for extended periods
    console.log("[RECOVERY] Triggering prediction pipeline...");
    const recoveryResult = await triggerRecovery();
    results.checks = { ...results.checks as object, recovery: recoveryResult };
    (results.actions as string[]).push("triggered_recovery");

    if (recoveryResult.healthy) {
      console.log("  ✓ Recovery successful");
      state.consecutive_failures = 0;

      await sendDiscordAlert(
        "Auto-Recovery Successful",
        `Watchdog detected missing predictions and triggered recovery.\n\n**Status:** Pipeline executed successfully` +
        (state.consecutive_failures > MAX_CONSECUTIVE_FAILURES ? `\n**Note:** Recovered after ${state.consecutive_failures} failures` : ""),
        0x00ff00 // Green
      );

      await updateWatchdogState({
        consecutive_failures: 0,
        last_recovery: new Date().toISOString(),
        last_check: new Date().toISOString()
      });
    } else {
      console.log(`  ✗ Recovery failed: ${recoveryResult.message}`);

      // Escalate alerts after MAX_CONSECUTIVE_FAILURES, but only alert every 6 failures to reduce noise
      const shouldAlert = state.consecutive_failures <= MAX_CONSECUTIVE_FAILURES ||
                          state.consecutive_failures % 6 === 0;

      if (shouldAlert) {
        const isEscalation = state.consecutive_failures > MAX_CONSECUTIVE_FAILURES;
        await sendDiscordAlert(
          isEscalation ? "🚨 CRITICAL: Persistent Failure" : "Recovery Failed",
          `Watchdog attempted recovery but it failed.\n\n**Error:** ${recoveryResult.message}\n**Failures:** ${state.consecutive_failures} consecutive` +
          (isEscalation ? `\n\n**Action Required:** Check Railway dashboard and logs manually.` : ""),
          0xff0000,
          isEscalation ? [
            { name: "Consecutive Failures", value: String(state.consecutive_failures), inline: true },
            { name: "Last Recovery", value: state.last_recovery || "Never", inline: true }
          ] : undefined
        );
        (results.actions as string[]).push(isEscalation ? "escalated" : "alerted");
      }

      await updateWatchdogState({
        consecutive_failures: state.consecutive_failures,
        last_alert: shouldAlert ? new Date().toISOString() : state.last_alert,
        last_check: new Date().toISOString()
      });
    }
  } else {
    // All healthy
    if (state.consecutive_failures > 0) {
      console.log(`\n✓ Recovered from ${state.consecutive_failures} consecutive failures`);
    } else {
      console.log("\n✓ All systems healthy");
    }

    await updateWatchdogState({
      consecutive_failures: 0,
      last_check: new Date().toISOString()
    });
  }

    console.log("\n" + "=".repeat(60));
    console.log(`Watchdog complete. Healthy: ${results.overall_healthy}`);
    console.log("=".repeat(60) + "\n");

    return {
      statusCode: results.overall_healthy ? 200 : 500,
      headers,
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error("[WATCHDOG] Fatal error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Watchdog crashed",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      })
    };
  }
};
