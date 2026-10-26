import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Deck } from "../lib/deck";
import { describeError } from "../lib/errors";
import { formatPoints } from "../lib/score";
import { toGuessOptions } from "../lib/songs";
import { deezer } from "../sources/deezer";
import type { PlayableTrack, PlaylistSummary } from "../sources/types";
import { Round, type RoundResult } from "./Round";

const FEW_TRACKS = 5;

interface Stats {
  points: number;
  played: number;
  correct: number;
  streak: number;
  best: number;
}

interface Props {
  playlist: PlaylistSummary;
  tracks: PlayableTrack[];
  totalTracks: number;
  onExit: () => void;
}

/** Endless mode: random songs from one playlist, with session score and streak. */
export function Game({ playlist, tracks, totalTracks, onExit }: Props) {
  const deck = useRef(new Deck(tracks));
  const [playableCount, setPlayableCount] = useState(tracks.length);
  const [round, setRound] = useState<{ n: number; track: PlayableTrack; previewUrl: string } | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ points: 0, played: 0, correct: 0, streak: 0, best: 0 });

  const options = useMemo(() => toGuessOptions(tracks), [tracks]);

  const busy = useRef(false);
  const startRound = useCallback(async () => {
    if (busy.current) return; // ignore double clicks and StrictMode's double effect
    busy.current = true;
    setLoadingRound(true);
    setRoundError(null);
    try {
      // Preview URLs expire, so fetch a fresh one for every round. If a
      // track's preview has vanished, drop it and draw another.
      for (;;) {
        const track = deck.current.draw();
        if (!track) {
          setRound(null);
          setRoundError("None of this playlist's previews are available any more.");
          return;
        }
        const previewUrl = await deezer.getPreviewUrl(track.audioId);
        if (previewUrl) {
          setRound((r) => ({ n: (r?.n ?? 0) + 1, track, previewUrl }));
          return;
        }
        deezer.forget(track.id);
        deck.current.remove(track);
        setPlayableCount(deck.current.size);
      }
    } catch (err) {
      setRoundError(describeError(err));
    } finally {
      busy.current = false;
      setLoadingRound(false);
    }
  }, []);

  useEffect(() => {
    startRound();
  }, [startRound]);

  const onFinish = ({ won, points }: RoundResult) =>
    setStats((s) => {
      const streak = won ? s.streak + 1 : 0;
      return {
        points: s.points + points,
        played: s.played + 1,
        correct: s.correct + (won ? 1 : 0),
        streak,
        best: Math.max(s.best, streak),
      };
    });

  return (
    <div className="game">
      <header className="game-header">
        <button className="btn ghost small" onClick={onExit}>
          ← Playlists
        </button>
        <div className="game-title">
          <h1>{playlist.name}</h1>
          <p className="muted">
            {playableCount} of {totalTracks} tracks playable
          </p>
        </div>
      </header>

      <div className="stats">
        <Stat label="Points" value={formatPoints(stats.points)} />
        <Stat label="Solved" value={`${stats.correct}/${stats.played}`} />
        <Stat label="Streak" value={stats.streak} />
        <Stat label="Best" value={stats.best} />
      </div>

      {playableCount < FEW_TRACKS && (
        <p className="notice">
          Only {playableCount} playable {playableCount === 1 ? "track" : "tracks"} — songs will repeat quickly.
        </p>
      )}

      {roundError && (
        <div className="error-box">
          <p>{roundError}</p>
          <button className="btn" onClick={startRound}>
            Try again
          </button>
        </div>
      )}

      {!round && loadingRound && <p className="muted center">Loading song…</p>}

      {round && (
        <Round
          key={round.n}
          track={round.track}
          previewUrl={round.previewUrl}
          options={options}
          onFinish={onFinish}
          onNext={startRound}
          nextLabel={loadingRound ? "Loading…" : "Next song"}
        />
      )}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
