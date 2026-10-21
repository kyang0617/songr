import { useState } from "react";
import { DAILY_GENRES, type DailyGenre } from "../../shared/daily";
import { isComplete, loadProgress } from "../lib/daily";
import { isConfigured, isLoggedIn, login } from "../sources/spotify/auth";

interface Props {
  date: string;
  error?: string;
  onDaily: (genre: DailyGenre) => void;
  onPlaylists: () => void;
}

export function Home({ date, error, onDaily, onPlaylists }: Props) {
  const [genre, setGenre] = useState(DAILY_GENRES[0]);
  const [redirecting, setRedirecting] = useState(false);
  const done = (g: DailyGenre) => isComplete(loadProgress(date, g.id));

  return (
    <div className="home">
      <div className="logo" aria-hidden>
        ♪
      </div>
      <h1>SongR</h1>
      <p className="muted">Name the song from a one-second clip.</p>

      {error && <p className="error-box">{error}</p>}

      <section className="card">
        <h2>Daily SongR</h2>
        <p className="muted small">5 songs, easy to expert. Same songs for everyone today. No login needed.</p>
        <div className="chips" role="radiogroup" aria-label="Genre">
          {DAILY_GENRES.map((g) => (
            <button
              key={g.id}
              role="radio"
              aria-checked={g.id === genre.id}
              className={`chip ${g.id === genre.id ? "selected" : ""}`}
              onClick={() => setGenre(g)}
            >
              {g.name}
              {done(g) && " ✓"}
            </button>
          ))}
        </div>
        <button className="btn primary wide" onClick={() => onDaily(genre)}>
          {done(genre) ? `See today's ${genre.name} results` : `Play today's ${genre.name}`}
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
