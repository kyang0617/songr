// Server-side Deezer access. Runs in Vercel functions and in the Vite dev
// middleware — never in the browser (Deezer's API has no CORS headers).

import { artistKey, cleanTitle, looselyEqual, matchKey, titleKey } from "../shared/normalize.js";

const API = "https://api.deezer.com";

// Deezer allows ~50 requests per 5 seconds. Stay a bit under it.
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 45;
const CONCURRENCY = 10;
const DURATION_TOLERANCE_S = 5;

export interface MatchInput {
  isrc?: string | null;
  title: string;
  artist: string;
  durationMs: number;
}

export interface MatchResult {
  deezerId: number | null;
  preview: string | null;
  via: "isrc" | "search" | null;
}

interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  duration: number;
  preview: string;
  artist: { name: string };
}

// --- throttling -------------------------------------------------------------

// Timestamps of recent requests. Module-level, so it is shared by every
// request handled by this server instance.
const recent: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function takeSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] >= WINDOW_MS) recent.shift();
    if (recent.length < MAX_PER_WINDOW) {
      recent.push(now);
      return;
    }
    await sleep(WINDOW_MS - (now - recent[0]) + 20);
  }
}

/** GET a Deezer endpoint. Returns null for Deezer "not found" style errors. */
async function deezerGet<T>(path: string, attempt = 0): Promise<T | null> {
  await takeSlot();
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
  const body = await res.json();
  if (body?.error) {
    // Code 4 = quota exceeded. Back off and retry a few times.
    if (body.error.code === 4 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      return deezerGet<T>(path, attempt + 1);
    }
    return null; // e.g. code 800 "no data" for an unknown ISRC
  }
  return body as T;
}

// --- public API -------------------------------------------------------------

export async function getTrack(id: number): Promise<{ id: number; preview: string | null } | null> {
  const track = await deezerGet<DeezerTrack>(`/track/${id}`);
  return track ? { id: track.id, preview: track.preview || null } : null;
}

export async function matchTracks(inputs: MatchInput[]): Promise<MatchResult[]> {
  const results: MatchResult[] = new Array(inputs.length);
  let next = 0;
  // Simple worker pool: CONCURRENCY workers pull from a shared index.
  const worker = async () => {
    while (next < inputs.length) {
      const i = next++;
      try {
        results[i] = await matchOne(inputs[i]);
      } catch {
        results[i] = { deezerId: null, preview: null, via: null };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, inputs.length) }, worker));
  return results;
}

async function matchOne(input: MatchInput): Promise<MatchResult> {
  // 1. Exact lookup by ISRC.
  if (input.isrc) {
    const track = await deezerGet<DeezerTrack>(`/track/isrc:${encodeURIComponent(input.isrc)}`);
    if (track?.preview) return { deezerId: track.id, preview: track.preview, via: "isrc" };
  }

  // 2. Search, from strict to loose, until one returns an acceptable result.
  //    Deezer's artist: filter misses some names (e.g. "The Killers"), hence
  //    the track-only query; the artist is still checked in isAcceptable.
  const artist = stripQuotes(input.artist);
  const title = stripQuotes(cleanTitle(input.title));
  const queries = [`artist:"${artist}" track:"${title}"`, `track:"${title}"`, `${artist} ${title}`];
  for (const q of queries) {
    const res = await deezerGet<{ data: DeezerTrack[] }>(`/search?q=${encodeURIComponent(q)}&limit=10`);
    const hit = pickBest((res?.data ?? []).filter((c) => isAcceptable(c, input)), input);
    if (hit) return { deezerId: hit.id, preview: hit.preview, via: "search" };
  }

  return { deezerId: null, preview: null, via: null };
}

function isAcceptable(candidate: DeezerTrack, input: MatchInput): boolean {
  if (!candidate.preview) return false;
  const durationOk = Math.abs(candidate.duration - input.durationMs / 1000) <= DURATION_TOLERANCE_S;
  const artistOk = looselyEqual(artistKey(candidate.artist.name), artistKey(input.artist));
  const wanted = titleKey(input.title);
  const titleOk =
    looselyEqual(titleKey(candidate.title), wanted) ||
    looselyEqual(titleKey(candidate.title_short ?? ""), wanted);
  // Normalization strips "Live", but a live recording isn't the song the
  // player knows, so live/studio status has to agree.
  const liveOk = isLive(candidate.title) === isLive(input.title);
  return durationOk && artistOk && titleOk && liveOk;
}

const isLive = (title: string) => /\blive\b/i.test(title);

// Prefer the closest raw title (so "Song" beats "Song - 2011 Remaster" when
// the input is plain "Song"), then the closest duration.
function pickBest(candidates: DeezerTrack[], input: MatchInput): DeezerTrack | undefined {
  const score = (c: DeezerTrack) =>
    (matchKey(c.title) === matchKey(input.title) ? 10 : 0) -
    Math.abs(c.duration - input.durationMs / 1000);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

const stripQuotes = (s: string) => s.replace(/"/g, "");
