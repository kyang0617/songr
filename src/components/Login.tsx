import { useState } from "react";
import { isConfigured, login } from "../sources/spotify/auth";

export function Login({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="login">
      <div className="logo" aria-hidden>
        ♪
      </div>
      <h1>Songr</h1>
      <p className="muted">Guess songs from your own Spotify playlists, one second at a time.</p>

      {error && <p className="error-box">{error}</p>}

      {isConfigured() ? (
        <button
          className="btn primary wide"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            login().catch(() => setBusy(false));
          }}
        >
          {busy ? "Redirecting…" : "Log in with Spotify"}
        </button>
      ) : (
        <p className="error-box">
          Missing <code>VITE_SPOTIFY_CLIENT_ID</code>. Add it to <code>.env.local</code> and restart the dev
          server — see the README.
        </p>
      )}
    </div>
  );
}
