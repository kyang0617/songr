// POST /api/deezer/match
// Body: { tracks: [{ isrc, title, artist, durationMs }] }  (max 50)
// Returns: { results: [{ deezerId, preview, via }] } in the same order.

import { matchTracks, type MatchInput } from "../../server/deezer.js";

const MAX_TRACKS = 50;

export async function POST(request: Request): Promise<Response> {
  let tracks: unknown;
  try {
    tracks = (await request.json())?.tracks;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  if (!Array.isArray(tracks) || tracks.length > MAX_TRACKS || !tracks.every(isMatchInput)) {
    return json({ error: `Expected { tracks: MatchInput[] } with at most ${MAX_TRACKS} items` }, 400);
  }

  try {
    return json({ results: await matchTracks(tracks) });
  } catch (err) {
    return json({ error: `Deezer request failed: ${(err as Error).message}` }, 502);
  }
}

function isMatchInput(t: unknown): t is MatchInput {
  const x = t as MatchInput;
  return (
    typeof x === "object" && x !== null &&
    typeof x.title === "string" &&
    typeof x.artist === "string" &&
    typeof x.durationMs === "number" &&
    (x.isrc == null || typeof x.isrc === "string")
  );
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
