/**
 * API Tennis Diagnostic
 * Tests if api-tennis.com connection works
 */

import type { Handler, HandlerEvent } from "@netlify/functions";

const API_BASE = "https://api.api-tennis.com/tennis/";

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  const apiKey = process.env.ATP_TENNIS_KEY;

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    apiKeySet: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPrefix: apiKey?.substring(0, 8) || "not set"
  };

  if (!apiKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: "ATP_TENNIS_KEY not set",
        diagnostics
      })
    };
  }

  try {
    // Test API call
    const url = new URL(API_BASE);
    url.searchParams.set("method", "get_fixtures");
    url.searchParams.set("APIkey", apiKey);
    url.searchParams.set("date_start", "2026-03-20");
    url.searchParams.set("date_stop", "2026-03-20");

    diagnostics.testUrl = url.toString().replace(apiKey, "***");

    const response = await fetch(url.toString());
    diagnostics.responseStatus = response.status;
    diagnostics.responseOk = response.ok;

    const data = await response.json();
    diagnostics.dataError = data.error;
    diagnostics.resultCount = Array.isArray(data.result) ? data.result.length : 0;
    diagnostics.sampleResult = Array.isArray(data.result) && data.result[0] ? {
      tournament_name: data.result[0].tournament_name,
      event_type_type: data.result[0].event_type_type
    } : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        diagnostics
      })
    };

  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        diagnostics
      })
    };
  }
};

export { handler };
