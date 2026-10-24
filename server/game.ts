// Generates a quick-play game: five random songs from the chosen genres and
// years, easiest first. Pure computation over a list of songs (by default
// server/catalog.ts, built offline by scripts/build-catalog.ts), so it needs
// no Deezer calls and works the same over songs from any other store.

import { GAME_LENGTH, type CatalogSong, type Game, type GameSettings, type GameTrack } from "../shared/game.js";
import { CATALOG } from "./catalog.js";

/**
 * Each slot's share of the popularity ranking, Easy first. Slots take
 * consecutive stretches of the ranking; songs past the last one are never
 * picked.
 */
const SLOT_SHARES = [0.2, 0.2, 0.2, 0.2, 0.2];

export class NotEnoughSongsError extends Error {}

/**
 * @param recent Deezer IDs the player had in recent games. Avoided when
 *   their slot has other songs, so famous ones don't come up every time.
 */
export function generateGame(
  settings: GameSettings,
  recent: Set<number>,
  songs: CatalogSong[] = CATALOG,
  rng = Math.random,
): Game {
  const inGenres = songs.filter((s) => s.genres.some((g) => settings.genres.includes(g)));
  const inRange = inGenres.filter((s) => s.year >= settings.from && s.year <= settings.to);
  if (artistCount(inRange) < GAME_LENGTH) {
    throw new NotEnoughSongsError("Not enough songs in that range. Try more genres or a wider range of years.");
  }

  // Every song in range, ranked by popularity and split into slots (see
  // SLOT_SHARES), so difficulty is relative to the chosen genres and years.
  // One pick per slot, by different artists, preferring songs the player
  // hasn't had recently.
  const ranked = [...inRange].sort((a, b) => b.popularity - a.popularity);
  const used = new Set<number>();
  const open = (s: CatalogSong) => !used.has(s.artistId);
  const picks: CatalogSong[] = [];
  let share = 0;
  for (const slotShare of SLOT_SHARES) {
    const start = Math.floor(share * ranked.length);
    share += slotShare;
    const end = Math.max(Math.floor(share * ranked.length), start + 1);
    const slot = ranked.slice(start, end).filter(open);
    const fresh = slot.filter((s) => !recent.has(s.id));
    // A small range can run out of new artists in a slot: take the
    // nearest-ranked song by a new artist instead.
    const choices = fresh.length ? fresh : slot.length ? slot : [nearest(ranked, (start + end) / 2, open)];
    const pick = choices[Math.floor(rng() * choices.length)];
    used.add(pick.artistId);
    picks.push(pick);
  }
  picks.sort((a, b) => b.popularity - a.popularity);

  return {
    tracks: picks.map(toGameTrack),
    pool: inGenres.map((s) => ({ title: s.title, artist: s.artist })),
  };
}

const artistCount = (songs: CatalogSong[]) => new Set(songs.map((s) => s.artistId)).size;

/** The song closest to `rank` in the ranking that passes `ok`. */
function nearest(ranked: CatalogSong[], rank: number, ok: (s: CatalogSong) => boolean): CatalogSong {
  let best = -1;
  ranked.forEach((s, i) => {
    if (ok(s) && (best < 0 || Math.abs(i - rank) < Math.abs(best - rank))) best = i;
  });
  return ranked[best];
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
