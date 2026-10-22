# Songr

A Songless-style music guessing game. Name the song from a 1-second clip;
each wrong guess or skip unlocks more: 1s → 2s → 4s → 7s → 11s → 16s.

Two modes:

- **Quick play** (no login). Pick one or more genres and a range of years,
  and get 5 random songs, easiest to hardest. Every game is new. Songs come
  from Deezer's editorial playlists, and the result can be shared as an emoji
  grid.
- **Your Spotify playlists** (login). Endless rounds from one of your own
  playlists, with score and streak. Spotify provides the playlists; Deezer
  provides the 30-second previews, since Spotify's API no longer returns them.
  Tracks are matched by ISRC first, then by a title/artist/duration search.
  Spotify only allows 5 invited users for apps in development mode.

## How it fits together

```
api/game.ts              GET a new quick-play game for genres + years
server/game.ts           Picks the songs: filter, sample, difficulty
server/catalog.ts        Generated song catalog (year, popularity, genres)
shared/catalog-index.ts  Generated year + genres per song, for the browser
shared/game.ts           Genre → Deezer playlist config, game types
scripts/build-catalog.ts Builds the catalog from Deezer + MusicBrainz
api/deezer/match.ts      POST batch matcher  (Vercel function)
api/deezer/track.ts      GET fresh preview URL by Deezer ID
server/deezer.ts         Deezer client: throttling, ISRC lookup, search fallback
shared/normalize.ts      Title/artist cleanup, used by browser and server
src/sources/types.ts     PlaylistSource + AudioSource interfaces
src/sources/spotify/     PKCE auth + Spotify PlaylistSource
src/sources/deezer.ts    Deezer AudioSource (calls /api, caches match IDs)
src/components/          Home, QuickPlay, Round (one song), Game (endless), …
src/lib/game.ts          Settings, song counts, recent songs, share text
src/hooks/usePreviewPlayer.ts  Audio element clipped to the reveal limit
vite.config.ts           Mounts the /api handlers on the dev server
```

- **Sources.** `App.tsx` wires one `PlaylistSource` (Spotify) to one
  `AudioSource` (Deezer). To add another provider, implement the interface
  from `src/sources/types.ts` and swap it in.
- **Deezer goes through `/api`.** Deezer doesn't allow browser requests
  (CORS). In development, `vite.config.ts` runs the same handlers as Vercel,
  so the Vercel CLI isn't needed.
- **Caching.** `localStorage` caches Spotify track ID → Deezer track ID, so a
  playlist only gets matched once. Preview URLs are signed and expire, so they
  are never stored. Each round fetches a fresh one.
- **Rate limit.** Deezer allows about 50 requests per 5 seconds. The server
  keeps a sliding window of 45 requests and runs up to 10 at a time. If Deezer
  reports a quota error anyway, it backs off and retries. The client sends
  tracks in batches of 25.

## How quick play works

Songs come from a catalog that's built ahead of time, so starting a game is
instant and makes no Deezer calls.

1. **Building the catalog** (`npm run catalog`). `shared/game.ts` lists
   Deezer editorial playlists of 2000s-and-later songs for each genre (00s
   Hits, Rap Bangers, Country Party, …). The script pools their tracks, drops
   those without a preview, keeps one version of each song, and records:
   - **Year.** The earliest of Deezer's release date and the year in the
     song's ISRC (characters 6–7 are when the recording was registered).
     Both can be late, never early: a 2000 hit on a 2018 "Greatest Hits"
     release says 2018 on Deezer, but its ISRC says 2000.
   - **Popularity.** Deezer's stream-based `rank` for the song, scaled to
     0–1. Only the song's own streams count, not the artist's fame, so an
     album track by a huge artist ranks below their hits. When a song is on
     several releases, the most-streamed one is kept.
   - **Genres.** Every genre whose playlists include the song.

   The catalog starts at `FIRST_YEAR` (2000). Songs dated earlier are
   dropped: an old ISRC is how a remastered classic gives itself away. That
   matters because Deezer dates remasters by the remaster, so a 1975 song can
   look like a 2011 one. Before 2000 that's most songs; from 2000 on, it's
   rare (about 1 in 20 is a year or more late, usually a 2000s song on a later
   compilation).

   The script writes `server/catalog.ts` and a small `shared/catalog-index.ts`
   (year and genres only), which the home screen uses to count matching songs
   as you change the settings. It takes about a minute. Commit the generated
   files.

   **Adding older decades.** Lower `FIRST_YEAR`, add older playlists, and run
   `npm run catalog -- --musicbrainz`. That looks up each song's original
   year on MusicBrainz (by ISRC, else by title and artist). MusicBrainz allows
   about one request per second, so the first run takes about 45 minutes;
   lookups are cached in `scripts/.cache`, so later runs only fetch new songs.
2. **Starting a game** (`/api/game`). The server filters the catalog by genre
   and year, takes a random sample of 30 songs by different artists, sorts
   them by popularity, and picks one from each fifth: Easy, Medium, Tricky,
   Hard, Expert. Songs from your last 100 are skipped when the range has
   enough others. Guess suggestions cover every song in the chosen genres,
   from any year, so the answer can't be narrowed down from the list.

To add a genre or playlist, find playlists with `curl https://api.deezer.com/chart/{genreId}/playlists`
(genre IDs: `curl https://api.deezer.com/genre`), edit `GENRES`, and run
`npm run catalog`.

The Spotify sections below are only needed for the playlist mode. Quick
play works without any setup.

## 1. Create the Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and click **Create app**. Since February 2026, the app owner needs Spotify
   Premium for development-mode apps.
2. Fill in a name and description. Under **Which API/SDKs are you planning to
   use?**, tick **Web API**.
3. Add both **Redirect URIs**. They must match exactly, with no trailing
   slash:
   - `http://127.0.0.1:5173/callback` for local development. Spotify no longer
     accepts `localhost`; the dev server listens on `127.0.0.1` and redirects
     `localhost` there for you.
   - `https://<your-project>.vercel.app/callback` for production. You can add
     this later, once you know the Vercel URL.
4. Save. Then open **Settings** and copy the **Client ID**. There is no client
   secret: the app uses Authorization Code with PKCE, entirely in the browser.
5. Put the Client ID in `.env.local` at the project root (see `.env.example`):
   ```
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   ```

### Development mode and test users

New Spotify apps start in **development mode**. Only accounts you allow can
log in, and Spotify caps that at 5 users per app.

1. In the dashboard, open your app → **Settings** → **User Management**.
2. Add each player's name and the **email address of their Spotify account**.
   Add your own too, if it's different from the developer account.
3. Anyone not on the list gets an error from Spotify when they log in.

Development mode has another limit: Spotify only returns the tracks of
playlists the user **owns or collaborates on**. Followed playlists, such as
Spotify's editorial ones, appear in the picker marked "may be unavailable",
and the game shows a clear error if you pick one. Lifting these limits means
applying for extended quota mode in the dashboard.

## 2. Run locally

Requires Node 20+.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. After changing `.env.local`, restart the dev
server.

To check the Deezer matcher without logging in:

```sh
curl -s -X POST http://127.0.0.1:5173/api/deezer/match \
  -H 'content-type: application/json' \
  -d '{"tracks":[{"isrc":"USUG11904206","title":"Blinding Lights","artist":"The Weeknd","durationMs":200040},
               {"title":"Mr. Brightside","artist":"The Killers","durationMs":222973}]}'

curl -s 'http://127.0.0.1:5173/api/deezer/track?id=908604612'
```

Other scripts: `npm run catalog` (see above), `npm run typecheck`, `npm run build`, `npm run preview`.

## 3. Deploy to Vercel

1. Push the repo to GitHub, GitLab or Bitbucket.
2. On [vercel.com/new](https://vercel.com/new), import it. Vercel detects
   Vite (build `npm run build`, output `dist`) and turns the files in `/api`
   into serverless functions automatically.
3. Under **Settings → Environment Variables**, add `VITE_SPOTIFY_CLIENT_ID`.
   It's read at build time, so redeploy after adding or changing it.
4. In the Spotify dashboard, add `https://<your-project>.vercel.app/callback`
   as a Redirect URI. Add one for any custom domain too.

`vercel.json` rewrites every path that isn't under `/api` to `index.html`, so
the `/callback` route works on a hard load.

The Vercel CLI works as well: `npm i -g vercel && vercel`. Use `vercel dev`
if you want to run the functions exactly as Vercel does. `npm run dev` is
enough for day-to-day work.

## Gameplay notes

- Guesses must be picked from the suggestion list. Typing alone doesn't count.
- After a skip, Play picks up where you left off, so you only hear the newly
  unlocked part. The replay button next to it plays everything unlocked so
  far from the start.
- Suggestions and guess checks use cleaned titles: "(Remastered 2011)",
  "- Live", "feat. X", "- Radio Edit" and similar are stripped. The reveal
  shows the real Spotify title. Two tracks with the same cleaned title and
  first artist count as the same song.
- Search matches must agree on artist, cleaned title, live vs. studio, and
  duration within 5 seconds.
- Songs don't repeat until every playable track in the playlist has come up.
- Score, streak and best streak last for the session. They reset when you
  start a new game.

## Ideas for later

- Stats across games (solve rate per difficulty, best decade).
- Rebuild the catalog on a schedule (e.g. a monthly GitHub Action), so new hits show up.
- Add Billboard's year-end Hot 100 lists (from Wikipedia) as a source: the
  biggest hits of each year, with the year included. It would fill out
  2010–2019, the thinnest part of the catalog.
- Tune difficulty from real results: record how often each song is solved,
  and how many guesses it takes.
- Cache tracks that failed to match, so they aren't retried on every load.
- Move the Deezer throttle to a shared store, such as Vercel KV, if several
  function instances end up hammering Deezer at once.
