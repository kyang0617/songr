// Generates a quick-play game: five random songs from the chosen genres and
// years, easiest first. Pure computation over a list of songs (by default
// server/catalog.ts, built offline by scripts/build-catalog.ts), so it needs
// no Deezer calls and works the same over songs from any other store.

import { GAME_LENGTH, type CatalogSong, type Game, type GameSettings, type GameTrack } from "../shared/game.js";
import { CATALOG } from "./catalog.js";

const SAMPLE_SIZE = 30;

export class NotEnoughSongsError extends Error {}

/**
 * @param recent Deezer IDs the player had in recent games. Avoided when the
 *   range has enough other songs, so famous ones don't come up every time.
 */
export function generateGame(
  settings: GameSettings,
  recent: Set<number>,
  songs: CatalogSong[] = CATALOG,
  rng = Math.random,
): Game {
  const inGenres = songs.filter((s) => s.genres.some((g) => settings.genres.includes(g)));
  const inRange = inGenres.filter((s) => s.year >= settings.from && s.year <= settings.to);
  const fresh = inRange.filter((s) => !recent.has(s.id));
  const candidates = artistCount(fresh) >= GAME_LENGTH * 3 ? fresh : inRange;
  if (artistCount(candidates) < GAME_LENGTH) {
    throw new NotEnoughSongsError("Not enough songs in that range. Try more genres or a wider range of years.");
  }

  // A random sample by different artists, ranked by popularity. One pick
  // from each fifth of the ranking: most popular fifth first.
  const ranked = sampleDistinctArtists(shuffle(candidates, rng), SAMPLE_SIZE).sort(
    (a, b) => b.popularity - a.popularity,
  );
  const picks: CatalogSong[] = [];
  for (let i = 0; i < GAME_LENGTH; i++) {
    const start = Math.floor((i * ranked.length) / GAME_LENGTH);
    const end = Math.floor(((i + 1) * ranked.length) / GAME_LENGTH);
    picks.push(ranked[start + Math.floor(rng() * (end - start))]);
  }

  return {
    tracks: picks.map(toGameTrack),
    pool: inGenres.map((s) => ({ title: s.title, artist: s.artist })),
  };
}

const artistCount = (songs: CatalogSong[]) => new Set(songs.map((s) => s.artistId)).size;

function sampleDistinctArtists(songs: CatalogSong[], size: number): CatalogSong[] {
  const seen = new Set<number>();
  const sample: CatalogSong[] = [];
  for (const s of songs) {
    if (seen.has(s.artistId)) continue;
    seen.add(s.artistId);
    sample.push(s);
    if (sample.length === size) break;
  }
  return sample;
}

function toGameTrack(s: CatalogSong): GameTrack {
  return {
    id: String(s.id),
    audioId: String(s.id),
    title: s.title,
    artists: [s.artist],
    album: s.album,
    coverUrl: s.cover,
    durationMs: s.duration * 1000,
    isrc: null,
    externalUrl: s.link,
    externalSite: "Deezer",
    year: s.year,
    popularity: s.popularity,
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
