// GET /api/game?genres=pop,rock&from=1980&to=1999&recent=123,456
// Returns a new random Game: five songs, easiest first, plus the guess pool.
// `recent` lists Deezer IDs from the player's last games, to avoid repeats.

import { findGenre } from "../shared/game.js";
import { generateGame, NotEnoughSongsError } from "../server/game.js";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const genres = (params.get("genres") ?? "").split(",").filter((id) => findGenre(id));
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));
  const recent = new Set((params.get("recent") ?? "").split(",").map(Number).filter(Boolean));

  if (genres.length === 0) return json({ error: "Pick at least one genre" }, 400);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
    return json({ error: "Invalid year range" }, 400);
  }

  try {
    return json(generateGame({ genres, from, to }, recent));
  } catch (err) {
    if (err instanceof NotEnoughSongsError) return json({ error: err.message }, 422);
    throw err;
  }
}

// Every game is different, so nothing is cacheable.
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
