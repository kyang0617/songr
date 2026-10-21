// Deezer as an AudioSource. All Deezer calls go through our /api functions
// because Deezer doesn't send CORS headers.
//
// We cache Spotify track ID → Deezer track ID (stable), never preview URLs
// (signed, they expire within hours).

import { readJSON, writeJSON } from "../lib/storage";
import type { AudioSource, Track } from "./types";

const CACHE_KEY = "songr.deezerMatches.v1";
const BATCH_SIZE = 25;

type MatchCache = Record<string, number>;

interface MatchResult {
  deezerId: number | null;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Couldn't reach the preview service (HTTP ${res.status}).`);
  return res.json();
}

export const deezer: AudioSource = {
  async match(tracks: Track[], onProgress) {
    const cache = readJSON<MatchCache>(CACHE_KEY, {});
    const matches = new Map<string, string>();
    const todo: Track[] = [];
    for (const t of tracks) {
      if (cache[t.id]) matches.set(t.id, String(cache[t.id]));
      else todo.push(t);
    }

    let done = tracks.length - todo.length;
    onProgress(done, tracks.length);

    // Batches run one after another; the server throttles requests to Deezer
    // within each batch.
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const { results } = await postJSON<{ results: MatchResult[] }>("/api/deezer/match", {
        tracks: batch.map((t) => ({
          isrc: t.isrc,
          title: t.title,
          artist: t.artists[0] ?? "",
          durationMs: t.durationMs,
        })),
      });
      results.forEach((r, j) => {
        if (r.deezerId) {
          cache[batch[j].id] = r.deezerId;
          matches.set(batch[j].id, String(r.deezerId));
        }
      });
      writeJSON(CACHE_KEY, cache); // save as we go, so a reload doesn't start over
      done += batch.length;
      onProgress(done, tracks.length);
    }
    return matches;
  },

  async getPreviewUrl(audioId: string) {
    const res = await fetch(`/api/deezer/track?id=${encodeURIComponent(audioId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Couldn't load the song preview (HTTP ${res.status}).`);
    const { preview } = await res.json();
    return preview || null;
  },

  forget(trackId: string) {
    const cache = readJSON<MatchCache>(CACHE_KEY, {});
    delete cache[trackId];
    writeJSON(CACHE_KEY, cache);
  },
};
