// GET /api/daily?genre=pop&date=2026-10-21
// Returns the DailyPuzzle for that genre and date. No preview URLs are
// included (they expire), so the response can be cached for the whole day.

import { findGenre } from "../shared/daily.js";
import { buildDailyPuzzle } from "../server/daily.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const genre = findGenre(params.get("genre") ?? "");
  const date = params.get("date") ?? "";

  if (!genre) return json({ error: "Unknown genre" }, 400);
  // The client sends its local date. Allow ±1 day around UTC for time zones,
  // but no peeking further ahead.
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(time) || Math.abs(time - Date.now()) > 2 * DAY_MS) {
    return json({ error: "Invalid date" }, 400);
  }

  try {
    const puzzle = await buildDailyPuzzle(genre, date);
    // Cache at the CDN, keyed by URL (genre + date), so players share one
    // puzzle even if Deezer's playlists change during the day.
    return json(puzzle, 200, "public, max-age=0, s-maxage=172800");
  } catch (err) {
    return json({ error: `Couldn't build today's puzzle: ${(err as Error).message}` }, 502);
  }
}

function json(body: unknown, status = 200, cache = "no-store"): Response {
  return Response.json(body, { status, headers: { "Cache-Control": cache } });
}
