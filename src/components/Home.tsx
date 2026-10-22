import { useState } from "react";
import { GENRES, MIN_SONGS, type GameSettings } from "../../shared/game";
import { countSongs, loadSettings, saveSettings, YEAR_MAX, YEAR_MIN } from "../lib/game";
import { isConfigured, isLoggedIn, login } from "../sources/spotify/auth";

interface Props {
  error?: string;
  onPlay: (settings: GameSettings) => void;
  onPlaylists: () => void;
}

// Decade shortcuts for the year range, e.g. 1980–1989 as "80s".
const DECADES = Array.from(
  { length: Math.floor(YEAR_MAX / 10) - Math.floor(Math.max(YEAR_MIN, 1950) / 10) + 1 },
  (_, i) => (Math.floor(Math.max(YEAR_MIN, 1950) / 10) + i) * 10,
);
const decadeLabel = (d: number) => `${String(d).slice(2)}s`;

export function Home({ error, onPlay, onPlaylists }: Props) {
  const [settings, setSettings] = useState(loadSettings);
  const [redirecting, setRedirecting] = useState(false);
  const { genres, from, to } = settings;
  const count = countSongs(settings);

  const update = (next: Partial<GameSettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    saveSettings(merged);
  };
  const toggleGenre = (id: string) => {
    const next = genres.includes(id) ? genres.filter((g) => g !== id) : [...genres, id];
    if (next.length) update({ genres: next }); // keep at least one
  };
  const isDecade = (d: number) => from === Math.max(d, YEAR_MIN) && to === Math.min(d + 9, YEAR_MAX);
  const allYears = from === YEAR_MIN && to === YEAR_MAX;

  return (
    <div className="home">
      <div className="logo" aria-hidden>
        ♪
      </div>
      <h1>SongR</h1>
      <p className="muted">Name the song from a one-second clip.</p>

      {error && <p className="error-box">{error}</p>}

      <section className="card">
        <h2>Quick play</h2>
        <p className="muted small">5 random songs, easy to expert. No login needed.</p>

        <h3 className="field-label">Genres</h3>
        <div className="chips" aria-label="Genres">
          {GENRES.map((g) => (
            <button
              key={g.id}
              aria-pressed={genres.includes(g.id)}
              className={`chip ${genres.includes(g.id) ? "selected" : ""}`}
              onClick={() => toggleGenre(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        <h3 className="field-label">
          Years <span className="muted">{allYears ? "All" : from === to ? from : `${from}–${to}`}</span>
        </h3>
        <div className="chips" aria-label="Decades">
          <button
            aria-pressed={allYears}
            className={`chip ${allYears ? "selected" : ""}`}
            onClick={() => update({ from: YEAR_MIN, to: YEAR_MAX })}
          >
            All
          </button>
          {DECADES.map((d) => (
            <button
              key={d}
              aria-pressed={isDecade(d)}
              className={`chip ${isDecade(d) ? "selected" : ""}`}
              onClick={() => update({ from: Math.max(d, YEAR_MIN), to: Math.min(d + 9, YEAR_MAX) })}
            >
              {decadeLabel(d)}
            </button>
          ))}
        </div>
        <label className="year-slider">
          <span>From</span>
          <input
            type="range"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={from}
            onChange={(e) => {
              const y = Number(e.target.value);
              update({ from: y, to: Math.max(to, y) });
            }}
          />
          <output>{from}</output>
        </label>
        <label className="year-slider">
          <span>To</span>
          <input
            type="range"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={to}
            onChange={(e) => {
              const y = Number(e.target.value);
              update({ to: y, from: Math.min(from, y) });
            }}
          />
          <output>{to}</output>
        </label>

        <p className={`small ${count < MIN_SONGS ? "error-text" : "muted"}`}>
          {count < MIN_SONGS
            ? `Only ${count} song${count === 1 ? "" : "s"} match. Add genres or widen the years.`
            : `${count} songs match`}
        </p>
        <button className="btn primary wide" disabled={count < MIN_SONGS} onClick={() => onPlay(settings)}>
          Play
        </button>
      </section>

      <section className="card">
        <h2>Your Spotify playlists</h2>
        <p className="muted small">
          Endless mode with songs from your own playlists. Spotify only lets invited test users log in.
        </p>
        {isLoggedIn() ? (
          <button className="btn wide" onClick={onPlaylists}>
            Choose a playlist
          </button>
        ) : isConfigured() ? (
          <button
            className="btn wide"
            disabled={redirecting}
            onClick={() => {
              setRedirecting(true);
              login().catch(() => setRedirecting(false));
            }}
          >
            {redirecting ? "Redirecting…" : "Log in with Spotify"}
          </button>
        ) : (
          <p className="muted small">
            Spotify login isn't set up (missing <code>VITE_SPOTIFY_CLIENT_ID</code>).
          </p>
        )}
      </section>
    </div>
  );
}
