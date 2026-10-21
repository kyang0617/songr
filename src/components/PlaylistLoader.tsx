import { useEffect, useState } from "react";
import { describeError, SessionExpiredError } from "../lib/errors";
import type { AudioSource, PlayableTrack, PlaylistSource, PlaylistSummary } from "../sources/types";

interface Props {
  playlist: PlaylistSummary;
  playlistSource: PlaylistSource;
  audioSource: AudioSource;
  onReady: (tracks: PlayableTrack[], totalTracks: number) => void;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
}

type Phase = { step: "tracks" } | { step: "matching"; done: number; total: number };

/** Fetches a playlist's tracks and matches them to previews, with progress. */
export function PlaylistLoader({ playlist, playlistSource, audioSource, onReady, onBack, onSessionExpired }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: "tracks" });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPhase({ step: "tracks" });

    (async () => {
      const tracks = await playlistSource.getTracks(playlist.id);
      if (cancelled) return;
      if (tracks.length === 0) {
        throw new Error(
          playlist.isOwn
            ? "This playlist has no songs in it."
            : "Spotify didn't return any songs for this playlist. It may not be yours — try one you own.",
        );
      }

      const matches = await audioSource.match(tracks, (done, total) => {
        if (!cancelled) setPhase({ step: "matching", done, total });
      });
      if (cancelled) return;

      const playable = tracks
        .filter((t) => matches.has(t.id))
        .map((t) => ({ ...t, audioId: matches.get(t.id)! }));
      if (playable.length === 0) {
        throw new Error(`None of the ${tracks.length} tracks have a preview available. Try another playlist.`);
      }
      onReady(playable, tracks.length);
    })().catch((err) => {
      if (cancelled) return;
      if (err instanceof SessionExpiredError) onSessionExpired(err.message);
      else setError(describeError(err));
    });

    return () => {
      cancelled = true;
    };
  }, [playlist, playlistSource, audioSource, onReady, onSessionExpired, attempt]);

  const pct = phase.step === "matching" && phase.total > 0 ? (phase.done / phase.total) * 100 : 0;

  return (
    <div className="loader">
      <h1>{playlist.name}</h1>
      {error ? (
        <div className="error-box">
          <p>{error}</p>
          <div className="row">
            <button className="btn ghost" onClick={onBack}>
              ← Back
            </button>
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="muted">
            {phase.step === "tracks"
              ? "Fetching tracks from Spotify…"
              : `Finding previews… ${phase.done} / ${phase.total}`}
          </p>
          <div className="load-bar">
            <div
              className={`load-bar-fill ${phase.step === "tracks" ? "indeterminate" : ""}`}
              style={phase.step === "matching" ? { width: `${pct}%` } : undefined}
            />
          </div>
          <button className="btn ghost small" onClick={onBack}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
