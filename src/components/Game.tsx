import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artistKey, cleanTitle, titleKey } from "../../shared/normalize";
import { usePreviewPlayer } from "../hooks/usePreviewPlayer";
import { Deck } from "../lib/deck";
import { describeError } from "../lib/errors";
import { deezer } from "../sources/deezer";
import type { PlayableTrack, PlaylistSummary } from "../sources/types";
import { GuessInput, type GuessOption } from "./GuessInput";
import { ProgressBar } from "./ProgressBar";
import { Reveal } from "./Reveal";

/** Seconds unlocked at each attempt. */
const STEPS = [1, 2, 4, 7, 11, 16];
const PREVIEW_LENGTH = 30;
const FEW_TRACKS = 5;

interface Guess {
  label: string;
  kind: "wrong" | "skip";
}

interface Round {
  track: PlayableTrack;
  previewUrl: string;
  guesses: Guess[];
  status: "playing" | "won" | "lost";
}

interface Stats {
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

// Two Spotify tracks count as the same song if their cleaned title and
// first artist match (e.g. the original and a remaster in one playlist).
const songKey = (t: PlayableTrack) => `${titleKey(t.title)}|${artistKey(t.artists[0] ?? "")}`;

export function Game({ playlist, tracks, totalTracks, onExit }: Props) {
  const deck = useRef(new Deck(tracks));
  const [playableCount, setPlayableCount] = useState(tracks.length);
  const [round, setRound] = useState<Round | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ played: 0, correct: 0, streak: 0, best: 0 });

  const options = useMemo<GuessOption[]>(() => {
    const byKey = new Map<string, GuessOption>();
    for (const t of tracks) {
      const key = songKey(t);
      if (!byKey.has(key)) byKey.set(key, { key, label: `${cleanTitle(t.title)} – ${t.artists.join(", ")}` });
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tracks]);

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
          setRound({ track, previewUrl, guesses: [], status: "playing" });
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

  const attempt = round?.guesses.length ?? 0;
  const finished = round !== null && round.status !== "playing";
  const limit = finished ? PREVIEW_LENGTH : STEPS[Math.min(attempt, STEPS.length - 1)];
  const player = usePreviewPlayer(round?.previewUrl ?? null, limit);

  // Play the full preview as soon as the answer is revealed.
  const { play, stop } = player;
  useEffect(() => {
    if (finished) play();
  }, [finished, play]);

  const finish = (r: Round, guess: Guess | null, won: boolean) => {
    const guesses = guess ? [...r.guesses, guess] : r.guesses;
    setRound({ ...r, guesses, status: won ? "won" : "lost" });
    setStats((s) => {
      const streak = won ? s.streak + 1 : 0;
      return { played: s.played + 1, correct: s.correct + (won ? 1 : 0), streak, best: Math.max(s.best, streak) };
    });
  };

  const addMiss = (guess: Guess) => {
    if (!round) return;
    stop();
    if (round.guesses.length + 1 >= STEPS.length) finish(round, guess, false);
    else setRound({ ...round, guesses: [...round.guesses, guess] });
  };

  const onGuess = (option: GuessOption) => {
    if (!round) return;
    if (option.key === songKey(round.track)) {
      stop();
      finish(round, null, true);
    } else {
      addMiss({ label: option.label, kind: "wrong" });
    }
  };

  const isLastAttempt = attempt === STEPS.length - 1;
  const skipLabel = isLastAttempt ? "Give up" : `Skip (+${STEPS[attempt + 1] - STEPS[attempt]}s)`;
  const wrongKeys = useMemo(
    () => new Set(options.filter((o) => round?.guesses.some((g) => g.label === o.label)).map((o) => o.key)),
    [options, round],
  );

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
        <Stat label="Score" value={`${stats.correct}/${stats.played}`} />
        <Stat label="Streak" value={stats.streak} />
        <Stat label="Best" value={stats.best} />
      </div>

      {playableCount < FEW_TRACKS && (
        <p className="notice">Only {playableCount} playable {playableCount === 1 ? "track" : "tracks"} — songs will repeat quickly.</p>
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
        <>
          {finished ? (
            <Reveal
              track={round.track}
              won={round.status === "won"}
              attempts={round.guesses.length + 1}
              onNext={startRound}
            />
          ) : (
            <ol className="attempts">
              {STEPS.map((_, i) => {
                const g = round.guesses[i];
                const cls = g ? g.kind : i === attempt ? "current" : "";
                return (
                  <li key={i} className={cls}>
                    {g ? (g.kind === "skip" ? "Skipped" : `✕ ${g.label}`) : ""}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="player">
            <ProgressBar
              totalSec={finished ? PREVIEW_LENGTH : STEPS[STEPS.length - 1]}
              unlockedSec={limit}
              positionSec={player.position}
              markers={finished ? [] : STEPS.slice(0, -1)}
            />
            <div className="player-row">
              <span className="time">{formatTime(player.position)}</span>
              <button
                className="play-btn"
                onClick={player.toggle}
                disabled={!player.ready && !player.playing}
                aria-label={player.playing ? "Stop" : "Play"}
              >
                {player.playing ? "■" : "▶"}
              </button>
              <span className="time">{formatTime(limit)}</span>
            </div>
            {!player.ready && !player.error && <p className="muted center small">Loading preview…</p>}
            {player.error && <p className="error-text center">{player.error}</p>}
          </div>

          {!finished && (
            <GuessInput
              options={options}
              excludedKeys={wrongKeys}
              skipLabel={skipLabel}
              onGuess={onGuess}
              onSkip={() => addMiss({ label: "", kind: "skip" })}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

const formatTime = (sec: number) => `0:${String(Math.floor(sec)).padStart(2, "0")}`;
