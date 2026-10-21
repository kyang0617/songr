# Songr

A Songless-style music guessing game. Name the song from a 1-second clip;
each wrong guess or skip unlocks more: 1s → 2s → 4s → 7s → 11s → 16s.

Two modes:

- **Daily SongR** (no login). Pick a genre and get 5 songs, easiest to
  hardest, the same for everyone that day. Songs come from Deezer's editorial
  playlists. Progress is saved in the browser, and the result can be shared as
  an emoji grid.
- **Your Spotify playlists** (login). Endless rounds from one of your own
  playlists, with score and streak. Spotify provides the playlists; Deezer
  provides the 30-second previews, since Spotify's API no longer returns them.
  Tracks are matched by ISRC first, then by a title/artist/duration search.
  Spotify only allows 5 invited users for apps in development mode.

## How it fits together

```
api/daily.ts             GET the daily puzzle for a genre + date
server/daily.ts          Builds the puzzle: pool, seeded sample, difficulty
shared/daily.ts          Genre → Deezer playlist config, puzzle types
api/deezer/match.ts      POST batch matcher  (Vercel function)
api/deezer/track.ts      GET fresh preview URL by Deezer ID
server/deezer.ts         Deezer client: throttling, ISRC lookup, search fallback
shared/normalize.ts      Title/artist cleanup, used by browser and server
src/sources/types.ts     PlaylistSource + AudioSource interfaces
src/sources/spotify/     PKCE auth + Spotify PlaylistSource
src/sources/deezer.ts    Deezer AudioSource (calls /api, caches match IDs)
src/components/          Home, Daily, Round (one song), Game (endless), …
src/lib/daily.ts         Daily progress in localStorage, share text
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

## How the daily puzzle works

1. `shared/daily.ts` lists a few Deezer editorial playlists per genre (Pop
   Essentials, 90s Hits, …). The server pools their tracks, drops those
   without a preview, and keeps one version of each song.
2. A random generator seeded with `date|genre` shuffles the pool and takes
   30 songs by different artists, so every player gets the same puzzle.
3. Each song gets a popularity score: the higher of Deezer's stream-based
   `rank` and the artist's fan count. The fan count covers famous songs that
   a playlist links on a little-played remaster. The 30 are sorted, and one
   song is picked from each fifth: Easy, Medium, Tricky, Hard, Expert.
4. The response has no preview URLs, so Vercel's CDN caches it per date
   (`s-maxage`), and the server also keeps it in memory. The browser saves
   the puzzle's songs with your progress, so a reload never changes them.

To add a genre, find playlists with `curl https://api.deezer.com/chart/{genreId}/playlists`
(genre IDs: `curl https://api.deezer.com/genre`) and add an entry to `DAILY_GENRES`.

The Spotify sections below are only needed for the playlist mode. The daily
mode works without any setup.

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

Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

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

- Daily streaks across days, and a stats page.
- Search the whole Deezer catalogue for daily guesses, not just the genre pool.
- Use Last.fm play counts as a second difficulty signal.
- Cache tracks that failed to match, so they aren't retried on every load.
- Move the Deezer throttle to a shared store, such as Vercel KV, if several
  function instances end up hammering Deezer at once.
