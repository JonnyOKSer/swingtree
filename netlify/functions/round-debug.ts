/**
 * Round Debug - Check what rounds api-tennis returns
 */

import type { Handler } from "@netlify/functions";


/** The slice of an api-tennis fixture this debug endpoint reads. */
interface TennisFixture {
  tournament_name?: string;
  tournament_round?: string;
  event_type_type?: string;
  event_first_player?: string;
  event_second_player?: string;
}


const API_BASE = "https://api.api-tennis.com/tennis/";

const handler: Handler = async () => {
  const headers = { "Content-Type": "application/json" };
  const apiKey = process.env.ATP_TENNIS_KEY;

  if (!apiKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: "No API key" }) };
  }

  try {
    const url = new URL(API_BASE);
    url.searchParams.set("method", "get_fixtures");
    url.searchParams.set("APIkey", apiKey);
    url.searchParams.set("date_start", "2026-03-20");
    url.searchParams.set("date_stop", "2026-03-20");

    const response = await fetch(url.toString());
    const data = await response.json();

    // Get unique rounds for WTA Miami
    const wtaMiami = ((data.result || []) as TennisFixture[]).filter((f: TennisFixture) =>
      f.tournament_name === "Miami" &&
      f.event_type_type.toLowerCase().includes("wta singles")
    );

    const rounds = [...new Set(wtaMiami.map((f: TennisFixture) => f.tournament_round))];
    const samples = wtaMiami.slice(0, 5).map((f: TennisFixture) => ({
      round: f.tournament_round,
      player1: f.event_first_player,
      player2: f.event_second_player
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        wtaMiamiCount: wtaMiami.length,
        uniqueRounds: rounds,
        samples
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(error) })
    };
  }
};

export { handler };
