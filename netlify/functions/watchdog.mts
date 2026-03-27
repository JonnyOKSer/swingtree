/**
 * ASHE Watchdog - External monitoring for Tennis Oracle crons
 *
 * This runs on Netlify (EXTERNAL to Railway) to monitor the Tennis Oracle service.
 * It cannot rely on Railway's cron system since that's what we're monitoring.
 *
 * Schedule: Every 2 hours (Railway health_check is every 4h, so we catch failures faster)
 *
 * Flow:
 * 1. Check if Tennis Oracle service is responding
 * 2. Check if predictions exist for today (after 10:00 UTC)
 * 3. If failures detected, trigger recovery via HTTP endpoint
 * 4. Alert via Discord on persistent failures
 * 5. Track consecutive failures and escalate after 3
 */

import type { Config, Context } from "@netlify/functions";
import { getPool } from "./db";

// Configuration
const TENNIS_ORACLE_URL = process.env.TENNIS_ORACLE_URL || "https://agent-production-765b.up.railway.app";
const TENNIS_ORACLE_API_KEY = process.env.TENNIS_ORACLE_API_KEY || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_ADMIN_WEBHOOK_URL || "";

const MAX_CONSECUTIVE_FAILURES = 3;
const HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
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

async function triggerRecovery(): Promise<CheckResult> {
  if (!TENNIS_ORACLE_API_KEY) {
    return { healthy: false, message: "No API key configured - cannot trigger recovery" };
  }

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
        return { healthy: true, message: "Recovery triggered successfully", details: data };
      }
      return { healthy: false, message: `Trigger returned error: ${JSON.stringify(data)}`, details: data };
    }
    if (response.status === 403) {
      return { healthy: false, message: "Trigger in progress (locked)" };
    }
    return { healthy: false, message: `Trigger failed: HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return { healthy: false, message: "Trigger timeout - pipeline may still be running" };
    }
    return { healthy: false, message: `Trigger error: ${error}` };
  }
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

export default async function handler(request: Request, context: Context) {
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

    return new Response(JSON.stringify(results), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Step 2: Check prediction status
  console.log("\n[2/3] Checking prediction status...");
  const predResult = await checkPredictionStatus();
  results.checks = { ...results.checks as object, predictions: predResult };
  console.log(`  ${predResult.healthy ? "✓" : "✗"} ${predResult.message}`);

  // Step 3: Determine if recovery is needed
  const needsRecovery = !predResult.healthy;

  if (needsRecovery) {
    results.overall_healthy = false;
    state.consecutive_failures += 1;
    console.log(`\n[RECOVERY] Failures detected (${state.consecutive_failures} consecutive)`);

    if (state.consecutive_failures <= MAX_CONSECUTIVE_FAILURES) {
      console.log("[RECOVERY] Triggering prediction pipeline...");
      const recoveryResult = await triggerRecovery();
      results.checks = { ...results.checks as object, recovery: recoveryResult };
      (results.actions as string[]).push("triggered_recovery");

      if (recoveryResult.healthy) {
        console.log("  ✓ Recovery successful");
        state.consecutive_failures = 0;

        await sendDiscordAlert(
          "Auto-Recovery Successful",
          `Watchdog detected missing predictions and triggered recovery.\n\n**Status:** Pipeline executed successfully`,
          0x00ff00 // Green
        );

        await updateWatchdogState({
          consecutive_failures: 0,
          last_recovery: new Date().toISOString(),
          last_check: new Date().toISOString()
        });
      } else {
        console.log(`  ✗ Recovery failed: ${recoveryResult.message}`);

        await sendDiscordAlert(
          "Recovery Failed",
          `Watchdog attempted recovery but it failed.\n\n**Error:** ${recoveryResult.message}\n**Failures:** ${state.consecutive_failures} consecutive`,
          0xff0000
        );

        await updateWatchdogState({
          consecutive_failures: state.consecutive_failures,
          last_check: new Date().toISOString()
        });
      }
    } else {
      // Escalate
      console.log(`[ESCALATE] ${state.consecutive_failures} failures - manual intervention required`);
      (results.actions as string[]).push("escalated");

      await sendDiscordAlert(
        "🚨 CRITICAL: Manual Intervention Required",
        `Watchdog has failed ${state.consecutive_failures} times consecutively.\n\n` +
        `**Service Health:** ${healthResult.message}\n` +
        `**Predictions:** ${predResult.message}\n\n` +
        `**Action Required:** Check Railway dashboard and logs manually.`,
        0xff0000,
        [
          { name: "Consecutive Failures", value: String(state.consecutive_failures), inline: true },
          { name: "Last Recovery", value: state.last_recovery || "Never", inline: true }
        ]
      );

      await updateWatchdogState({
        consecutive_failures: state.consecutive_failures,
        last_alert: new Date().toISOString(),
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

  return new Response(JSON.stringify(results), {
    status: results.overall_healthy ? 200 : 500,
    headers: { "Content-Type": "application/json" }
  });
}

// Netlify scheduled function config - runs every 2 hours
export const config: Config = {
  schedule: "0 */2 * * *"  // Every 2 hours
};
