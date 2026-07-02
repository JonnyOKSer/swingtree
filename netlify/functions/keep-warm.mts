/**
 * Keep-Warm - Prevents Railway cold starts by pinging the health endpoint
 *
 * Schedule: Every 10 minutes
 *
 * Railway services go to sleep after ~5-10 minutes of inactivity.
 * Cold starts take 30-40+ seconds, which causes watchdog timeouts.
 * This function keeps Railway warm by pinging it regularly.
 */

import type { Handler, Config } from "@netlify/functions";

export const config: Config = {
  schedule: "*/10 * * * *" // Every 10 minutes
};

const TENNIS_ORACLE_URL = process.env.TENNIS_ORACLE_URL || "https://agent-production-765b.up.railway.app";

export const handler: Handler = async () => {
  const startTime = Date.now();

  try {
    const response = await fetch(`${TENNIS_ORACLE_URL}/health`, {
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const elapsed = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      console.log(`[KEEP-WARM] Railway healthy in ${elapsed}ms`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "ok",
          railway_status: data.status,
          response_time_ms: elapsed,
          timestamp: new Date().toISOString()
        })
      };
    } else {
      console.log(`[KEEP-WARM] Railway returned ${response.status} in ${elapsed}ms`);
      return {
        statusCode: 200, // Still 200 - we're just pinging
        body: JSON.stringify({
          status: "railway_error",
          railway_status_code: response.status,
          response_time_ms: elapsed,
          timestamp: new Date().toISOString()
        })
      };
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[KEEP-WARM] Railway unreachable after ${elapsed}ms: ${message}`);

    return {
      statusCode: 200, // Still 200 - this function itself succeeded
      body: JSON.stringify({
        status: "railway_unreachable",
        error: message,
        response_time_ms: elapsed,
        timestamp: new Date().toISOString()
      })
    };
  }
};
