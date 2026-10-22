// Builds the song catalog that quick-play games are drawn from:
//   server/catalog.ts         every song: Deezer ID, year, popularity, genres
//   shared/catalog-index.ts   year + genres of each song, for the settings screen
//
//   npm run catalog                    Deezer years (fine from FIRST_YEAR = 2000)
//   npm run catalog -- --musicbrainz   original years from MusicBrainz
//
// Deezer dates the release, not the song: "Bohemian Rhapsody" on the 2011
// remaster says 2011. For 2000s+ songs from 2000s+ playlists that's accurate,
// and songs whose Deezer or ISRC year is before FIRST_YEAR are dropped (old
// songs on remasters). To include older decades, lower FIRST_YEAR and use
// --musicbrainz: it looks up original years (by ISRC, else by search), at
// ~1 request per second, so a first build takes about 45 minutes.
// Every lookup is cached in scripts/.cache, so re-runs only fetch new songs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FIRST_YEAR, GENRES, type CatalogSong } from "../shared/game.js";
import { artistKey, cleanTitle, looselyEqual, titleKey } from "../shared/normalize.js";
import { getArtistFans, getPlaylistTracks, getTrackDetails, mapPool, type DeezerTrack } from "../server/deezer.js";

const CACHE_DIR = "scripts/.cache";
const MB = "https://musicbrainz.org/ws/2";
// MusicBrainz asks for an identifying User-Agent with a contact URL.
const USER_AGENT = "SongR/0.1 ( https://github.com/kyang0617/songr )";
const MB_INTERVAL_MS = 1100;
const USE_MUSICBRAINZ = process.argv.includes("--musicbrainz");

// --- cache ------------------------------------------------------------------

function fileCache<T>(name: string) {
  const path = `${CACHE_DIR}/${name}.json`;
  const data: Record<string, T> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return {
    has: (key: string | number) => key in data,
    get: (key: string | number) => data[key],
    set: (key: string | number, value: T) => void (data[key] = value),
    save: () => writeFileSync(path, JSON.stringify(data)),
  };
}

mkdirSync(CACHE_DIR, { recursive: true });
const trackCache = fileCache<{ isrc: string | null; date: string | null }>("deezer-tracks");
const fanCache = fileCache<number>("deezer-fans");
const yearCache = fileCache<number | null>("musicbrainz-years");

// --- MusicBrainz --------------------------------------------------------------

interface MbRecording {
  title: string;
  score?: number;
  "first-release-date"?: string;
  "artist-credit"?: { name: string }[];
}

let lastMbRequest = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mbGet<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = lastMbRequest + MB_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastMbRequest = Date.now();
    const res = await fetch(MB + path, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) return null;
    await sleep(3000 * (attempt + 1)); // 503 = rate limited
  }
  throw new Error(`MusicBrainz kept failing for ${path}`);
}

const yearOf = (date?: string | null) => {
  const year = Number(date?.slice(0, 4));
  return year >= 1900 ? year : null;
};

/** ISRCs are CC-XXX-YY-NNNNN, YY = the year the recording was registered. */
function isrcYear(isrc?: string | null): number | null {
  const yy = Number(isrc?.slice(5, 7));
  if (!isrc || isrc.length !== 12 || Number.isNaN(yy)) return null;
  const year = 2000 + yy;
  const full = year <= new Date().getFullYear() ? year : year - 100;
  return full >= 1950 ? full : null; // ISRCs started in 1986; older codes are backfills
}

const earliest = (recordings: MbRecording[]) =>
  recordings.reduce<number | null>((min, r) => {
    const y = yearOf(r["first-release-date"]);
    return y !== null && (min === null || y < min) ? y : min;
  }, null);

/** Earliest release year MusicBrainz knows for the song: by ISRC, else by search. */
async function originalYear(song: DeezerTrack, isrc: string | null): Promise<number | null> {
  if (isrc) {
    const byIsrc = await mbGet<{ recordings: MbRecording[] }>(`/isrc/${encodeURIComponent(isrc)}?fmt=json`);
    const year = earliest(byIsrc?.recordings ?? []);
    if (year !== null) return year;
  }
  const q = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
  const query = `recording:${q(cleanTitle(song.title))} AND artist:${q(song.artist.name)}`;
  const found = await mbGet<{ recordings: MbRecording[] }>(
    `/recording?fmt=json&limit=25&query=${encodeURIComponent(query)}`,
  );
  // Only confident hits for the same song and artist; covers and other
  // songs with the same name would drag the year around.
  const same = (found?.recordings ?? []).filter(
    (r) =>
      (r.score ?? 0) >= 90 &&
      looselyEqual(titleKey(r.title), titleKey(song.title)) &&
      (r["artist-credit"] ?? []).some((a) => looselyEqual(artistKey(a.name), artistKey(song.artist.name))),
  );
  return earliest(same);
}

// --- build ------------------------------------------------------------------

/**
 * 0 – 1, how likely a player is to know the song. Deezer's `rank` is
 * stream-based but per release, so a famous song on a little-played remaster
 * can rank near zero; the artist's fan count catches those.
 */
function popularity(rank: number, fans: number): number {
  const streams = rank / 1_000_000;
  const fame = Math.min(1, Math.max(0, (Math.log10(fans + 1) - 3) / 4)); // 1k fans → 0, 10M → 1
  return Math.round(Math.max(streams, fame) * 100) / 100;
}

async function main() {
  // 1. Every playable track of every genre playlist, one entry per song
  //    (most-streamed version), remembering which genres it came from.
  const songs = new Map<string, { track: DeezerTrack; genres: Set<string> }>();
  for (const genre of GENRES) {
    const lists = await mapPool(genre.playlists, getPlaylistTracks);
    const tracks = lists.flat().filter((t) => t.preview && t.readable !== false);
    console.log(`${genre.name}: ${tracks.length} tracks from ${genre.playlists.length} playlists`);
    for (const t of tracks) {
      const key = `${titleKey(t.title)}|${artistKey(t.artist.name)}`;
      const song = songs.get(key);
      if (!song) songs.set(key, { track: t, genres: new Set([genre.id]) });
      else {
        song.genres.add(genre.id);
        if (t.rank > song.track.rank) song.track = t;
      }
    }
  }
  const all = [...songs.values()];
  console.log(`${all.length} distinct songs`);

  // 2. ISRC + release date (Deezer), and artist fan counts.
  //    A failed request (network blip) just leaves that song out of this
  //    build; it isn't cached, so the next run retries it.
  let failed = 0;
  const attempt = <T>(fn: () => Promise<T>) => fn().catch(() => void failed++);
  const todo = all.filter((s) => !trackCache.has(s.track.id));
  await mapPool(todo, (s) =>
    attempt(async () => {
      const full = await getTrackDetails(s.track.id);
      trackCache.set(s.track.id, { isrc: full?.isrc ?? null, date: full?.release_date ?? null });
    }),
  );
  trackCache.save();
  const artists = [...new Set(all.map((s) => s.track.artist.id))].filter((id) => !fanCache.has(id));
  await mapPool(artists, (id) => attempt(async () => fanCache.set(id, await getArtistFans(id))));
  fanCache.save();
  console.log(`Deezer details done (${todo.length} tracks, ${artists.length} artists, ${failed} failed)`);

  // 3. Original years from MusicBrainz, one request at a time (opt-in).
  const needYear = USE_MUSICBRAINZ ? all.filter((s) => !yearCache.has(s.track.id)) : [];
  for (const [i, s] of needYear.entries()) {
    yearCache.set(s.track.id, await originalYear(s.track, trackCache.get(s.track.id)?.isrc ?? null));
    if (i % 25 === 24 || i === needYear.length - 1) {
      yearCache.save();
      console.log(`MusicBrainz: ${i + 1}/${needYear.length}`);
    }
  }

  // 4. Year = earliest of the Deezer release date, the ISRC's registration
  //    year and (with --musicbrainz) the original release. All three can be
  //    late (a "Greatest Hits" release, a remaster's new ISRC), never early.
  //    Songs before FIRST_YEAR are dropped: without MusicBrainz, an old ISRC
  //    is how a remaster or reissue gives itself away.
  let tooOld = 0;
  const catalog: CatalogSong[] = [];
  for (const { track: t, genres } of all) {
    const details = trackCache.get(t.id);
    if (!details) continue;
    const mb = USE_MUSICBRAINZ ? (yearCache.get(t.id) ?? null) : null;
    const years = [yearOf(details.date), isrcYear(details.isrc), mb].filter((y): y is number => y !== null);
    if (years.length === 0) continue;
    // Capped at this year: Deezer gives upcoming releases their future date.
    const year = Math.min(...years, new Date().getFullYear());
    if (year < FIRST_YEAR) {
      tooOld++;
      continue;
    }
    catalog.push({
      id: t.id,
      title: t.title,
      artist: t.artist.name,
      artistId: t.artist.id,
      album: t.album.title,
      cover: t.album.cover_xl ?? t.album.cover_big ?? null,
      duration: t.duration,
      link: t.link,
      year,
      popularity: popularity(t.rank, fanCache.get(t.artist.id) ?? 0),
      genres: GENRES.map((g) => g.id).filter((id) => genres.has(id)),
    });
  }
  catalog.sort((a, b) => a.year - b.year || a.artist.localeCompare(b.artist));

  const header = `// Generated by scripts/build-catalog.ts (npm run catalog). Don't edit by hand.\n`;
  writeFileSync(
    "server/catalog.ts",
    header +
      `import type { CatalogSong } from "../shared/game.js";\n\n` +
      `export const CATALOG: CatalogSong[] = [\n${catalog.map((s) => `  ${JSON.stringify(s)},`).join("\n")}\n];\n`,
  );
  // [year, genre bitmask] per song, in GENRES order. Small enough to ship to
  // the browser, so the settings screen can count matching songs instantly.
  const index = catalog.map((s) => [s.year, GENRES.reduce((m, g, i) => (s.genres.includes(g.id) ? m | (1 << i) : m), 0)]);
  writeFileSync(
    "shared/catalog-index.ts",
    header + `\n/** [year, genre bitmask (bit i = GENRES[i])] for every catalog song. */\n` +
      `export const CATALOG_INDEX: [number, number][] = ${JSON.stringify(index)};\n`,
  );
  console.log(`Wrote ${catalog.length} songs (dropped ${tooOld} from before ${FIRST_YEAR})`);
  for (const g of GENRES) {
    const songs = catalog.filter((s) => s.genres.includes(g.id));
    const years = songs.map((s) => s.year);
    console.log(`  ${g.name}: ${songs.length} songs, ${Math.min(...years)}–${Math.max(...years)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
