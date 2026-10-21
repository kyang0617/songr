// GET /api/deezer/track?id=123
// Returns a fresh { id, preview } — preview URLs are signed and expire, so the
// client asks for one right before each round.

import { getTrack } from "../../server/deezer.js";

export async function GET(request: Request): Promise<Response> {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Missing or invalid id" }, 400);

  try {
    const track = await getTrack(id);
    if (!track) return json({ error: "Track not found on Deezer" }, 404);
    return json(track);
  } catch (err) {
    return json({ error: `Deezer request failed: ${(err as Error).message}` }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
