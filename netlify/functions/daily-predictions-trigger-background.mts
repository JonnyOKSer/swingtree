/**
 * Daily Predictions Trigger (Background)
 *
 * Redundant with Railway's own daily-predictions cron. Runs at 09:00 UTC every
 * morning and POSTs to Railway's /trigger endpoint. If Railway cron fires
 * first, /trigger is a no-op (existing predictions skip). If Railway cron
 * silently dies (as it has done twice in the last 4 months), this catches it
 * within hours instead of waiting for the watchdog to notice.
 *
 * Background suffix (`-background.mts`) gives us Netlify's 15-min timeout
 * window, so we can absorb Railway cold starts + full prediction run without
 * getting cut off at 26s.
 */

import type { Config } from "@netlify/functions";

export const config: Config = {
  schedule: "0 9 * * *", // 09:00 UTC every day
};

const TENNIS_ORACLE_URL =
  process.env.TENNIS_ORACLE_URL || "https://agent-production-765b.up.railway.app";
const TENNIS_ORACLE_API_KEY = process.env.TENNIS_ORACLE_API_KEY || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_ADMIN_WEBHOOK_URL || "";

async function sendDiscord(title: string, body: string, color: number) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `🌅 Daily Trigger: ${title}`,
          description: body,
          color,
          timestamp: new Date().toISOString(),
        }]
      })
    });
  } catch (e) {
    console.error("Discord alert failed:", e);
  }
}

export default async (): Promise<Response> => {
  const start = Date.now();
  console.log(`[DAILY-TRIGGER] Firing at ${new Date().toISOString()}`);

  if (!TENNIS_ORACLE_API_KEY) {
    console.error("[DAILY-TRIGGER] No API key configured - skipping");
    return new Response(
      JSON.stringify({ success: false, error: "no api key" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Warm the service first so /trigger doesn't cold-start-timeout.
    await fetch(`${TENNIS_ORACLE_URL}/health`, {
      signal: AbortSignal.timeout(60000),
    }).catch(() => {});

    const response = await fetch(`${TENNIS_ORACLE_URL}/trigger`, {
      method: "POST",
      headers: { "X-API-Key": TENNIS_ORACLE_API_KEY },
      signal: AbortSignal.timeout(600000), // 10 min for the full pipeline
    });

    const elapsed = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const preds =
        data?.status?.predictions_today ??
        data?.status?.prediction_log_count ??
        0;
      console.log(
        `[DAILY-TRIGGER] Success in ${(elapsed / 1000).toFixed(1)}s — ${preds} predictions`
      );
      if (preds === 0) {
        // Trigger ran but produced nothing — could be an off-day, but worth flagging.
        await sendDiscord(
          "No predictions generated",
          `/trigger returned success but predictions_today=0. Check if there are any scheduled matches today.`,
          0xffa500
        );
      }
      return new Response(JSON.stringify({ success: true, elapsed, preds }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 403 means the pipeline is already running (lock held) — that's fine,
    // the watchdog or Railway cron beat us to it.
    if (response.status === 403) {
      console.log(`[DAILY-TRIGGER] Trigger locked (another run in progress) — OK`);
      return new Response(
        JSON.stringify({ success: true, note: "locked, another run in flight" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await response.text().catch(() => "");
    console.error(`[DAILY-TRIGGER] HTTP ${response.status}: ${body.slice(0, 200)}`);
    await sendDiscord(
      "Trigger failed",
      `HTTP ${response.status} calling /trigger.\n\n\`\`\`${body.slice(0, 500)}\`\`\``,
      0xff0000
    );
    return new Response(
      JSON.stringify({ success: false, status: response.status, body: body.slice(0, 500) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DAILY-TRIGGER] Fatal: ${msg}`);
    await sendDiscord(
      "Trigger crashed",
      `Exception before /trigger returned:\n\n\`\`\`${msg.slice(0, 500)}\`\`\``,
      0xff0000
    );
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
