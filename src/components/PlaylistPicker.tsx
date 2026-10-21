import { useEffect, useState } from "react";
import { describeError, SessionExpiredError } from "../lib/errors";
import type { PlaylistSource, PlaylistSummary } from "../sources/types";

interface Props {
  source: PlaylistSource;
  onPick: (playlist: PlaylistSummary) => void;
  onLogout: () => void;
  onSessionExpired: (message: string) => void;
}

export function PlaylistPicker({ source, onPick, onLogout, onSessionExpired }: Props) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    source
      .listPlaylists()
      .then((p) => !cancelled && setPlaylists(p))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) onSessionExpired(err.message);
        else setError(describeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [source, attempt, onSessionExpired]);

  return (
    <div className="picker">
      <header className="picker-header">
        <h1>Pick a playlist</h1>
        <button className="btn ghost small" onClick={onLogout}>
          Log out
        </button>
      </header>

      {error && (
        <div className="error-box">
          <p>{error}</p>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}

      {!playlists && !error && <p className="muted center">Loading your playlists…</p>}

      {playlists?.length === 0 && (
        <p className="muted center">You don't have any playlists yet. Make one in Spotify, then come back.</p>
      )}

      {playlists && playlists.length > 0 && (
        <ul className="playlist-grid">
          {playlists.map((p) => (
            <li key={p.id}>
              <button className="playlist-card" onClick={() => onPick(p)}>
                {p.coverUrl ? (
                  <img src={p.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div className="cover-placeholder">♪</div>
                )}
                <span className="playlist-name">{p.name}</span>
                <span className="muted small">
                  {p.trackCount !== null ? `${p.trackCount} tracks` : `by ${p.ownerName}`}
                  {!p.isOwn && " · may be unavailable"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
