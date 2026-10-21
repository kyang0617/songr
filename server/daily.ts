// Builds the Daily SongR puzzle for a genre and date.
//
// 1. Pool every playable song from the genre's Deezer playlists.
// 2. With a random generator seeded by date + genre (so everyone gets the same
//    puzzle), sample a few dozen songs by different artists.
// 3. Score how well-known each one is and pick one song from each fifth of
//    the ranking, easiest first.

import { DAILY_LENGTH, type DailyGenre, type DailyPuzzle, type DailyTrack } from "../shared/daily.js";
import { artistKey, titleKey } from "../shared/normalize.js";
import { getArtistFans, getPlaylistTracks, mapPool, type DeezerTrack } from "./deezer.js";

const SAMPLE_SIZE = 30;

export async function buildDailyPuzzle(genre: DailyGenre, date: string): Promise<DailyPuzzle> {
  const playlists = await mapPool(genre.playlists, getPlaylistTracks);
  const pool = dedupe(playlists.flat().filter((t) => t.preview && t.readable !== false));
  if (pool.length < DAILY_LENGTH) throw new Error(`Not enough playable songs for ${genre.name}`);

  const rng = seededRandom(`${date}|${genre.id}`);
  const sample = sampleDistinctArtists(shuffle(pool, rng), SAMPLE_SIZE);
  const fans = await mapPool(sample, (t) => getArtistFans(t.artist.id));
  const ranked = sample
    .map((track, i) => ({ track, popularity: popularity(track.rank, fans[i]) }))
    .sort((a, b) => b.popularity - a.popularity);

  // One pick from each fifth of the ranking: most popular fifth first.
  const picks = [];
  for (let i = 0; i < DAILY_LENGTH; i++) {
    const start = Math.floor((i * ranked.length) / DAILY_LENGTH);
    const end = Math.floor(((i + 1) * ranked.length) / DAILY_LENGTH);
    picks.push(ranked[start + Math.floor(rng() * (end - start))]);
  }

  return {
    date,
    genre: genre.id,
    tracks: picks.map(({ track, popularity }) => toDailyTrack(track, popularity)),
    pool: pool.map((t) => ({ title: t.title, artist: t.artist.name })),
  };
}

/**
 * 0 – 1, how likely a player is to know the song. Deezer's `rank` is
 * stream-based but per release, so a famous song on a little-played remaster
 * can rank near zero; the artist's fan count catches those.
 */
function popularity(rank: number, fans: number): number {
  const streams = rank / 1_000_000;
  const fame = Math.min(1, Math.max(0, (Math.log10(fans + 1) - 3) / 4)); // 1k fans → 0, 10M → 1
  return Math.max(streams, fame);
}

/** One entry per song (same cleaned title + artist), keeping the most-streamed version. */
function dedupe(tracks: DeezerTrack[]): DeezerTrack[] {
  const bySong = new Map<string, DeezerTrack>();
  for (const t of tracks) {
    const key = `${titleKey(t.title)}|${artistKey(t.artist.name)}`;
    const existing = bySong.get(key);
    if (!existing || t.rank > existing.rank) bySong.set(key, t);
  }
  return [...bySong.values()];
}

function sampleDistinctArtists(tracks: DeezerTrack[], size: number): DeezerTrack[] {
  const seen = new Set<number>();
  const sample: DeezerTrack[] = [];
  for (const t of tracks) {
    if (seen.has(t.artist.id)) continue;
    seen.add(t.artist.id);
    sample.push(t);
    if (sample.length === size) break;
  }
  return sample;
}

function toDailyTrack(t: DeezerTrack, popularity: number): DailyTrack {
  return {
    id: String(t.id),
    audioId: String(t.id),
    title: t.title,
    artists: [t.artist.name],
    album: t.album.title,
    coverUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
    durationMs: t.duration * 1000,
    isrc: null,
    externalUrl: t.link,
    externalSite: "Deezer",
    popularity: Math.round(popularity * 100) / 100,
  };
}

// --- seeded randomness ------------------------------------------------------

/** mulberry32 seeded from an FNV-1a hash of the string. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
