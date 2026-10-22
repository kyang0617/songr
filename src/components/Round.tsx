import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePreviewPlayer } from "../hooks/usePreviewPlayer";
import { songKey } from "../lib/songs";
import type { PlayableTrack } from "../sources/types";
import { GuessInput, type GuessOption } from "./GuessInput";
import { ProgressBar } from "./ProgressBar";
import { Reveal } from "./Reveal";

/** Seconds unlocked at each attempt. */
export const STEPS = [1, 2, 4, 7, 11, 16];
const PREVIEW_LENGTH = 30;

export interface Guess {
  label: string;
  kind: "wrong" | "skip" | "correct";
}

export interface RoundResult {
  won: boolean;
  guesses: Guess[];
}

interface Props {
  track: PlayableTrack;
  previewUrl: string;
  options: GuessOption[];
  /** Called once, when the song is guessed or attempts run out. */
  onFinish: (result: RoundResult) => void;
  onNext: () => void;
  nextLabel: string;
  /** Shown above the attempts, e.g. "Song 2 of 5 · Medium". */
  heading?: ReactNode;
}

/** One song: play the clip, guess or skip, then reveal. Remount (via `key`) for each new song. */
export function Round({ track, previewUrl, options, onFinish, onNext, nextLabel, heading }: Props) {
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const won = guesses.at(-1)?.kind === "correct";
  const finished = won || guesses.length >= STEPS.length;

  const attempt = guesses.length;
  const limit = finished ? PREVIEW_LENGTH : STEPS[attempt];
  const player = usePreviewPlayer(previewUrl, limit);

  // Play the full preview from the start as soon as the answer is revealed.
  const { replay, stop } = player;
  useEffect(() => {
    if (finished) replay();
  }, [finished, replay]);

  const record = (guess: Guess) => {
    stop();
    const next = [...guesses, guess];
    setGuesses(next);
    if (guess.kind === "correct" || next.length >= STEPS.length) {
      onFinish({ won: guess.kind === "correct", guesses: next });
    }
  };

  const answerKey = songKey(track.title, track.artists[0] ?? "");
  const onGuess = (option: GuessOption) =>
    record({ label: option.label, kind: option.key === answerKey ? "correct" : "wrong" });

  const isLastAttempt = attempt === STEPS.length - 1;
  const skipLabel = isLastAttempt ? "Give up" : `Skip (+${STEPS[attempt + 1] - STEPS[attempt]}s)`;
  const wrongKeys = useMemo(
    () => new Set(options.filter((o) => guesses.some((g) => g.label === o.label)).map((o) => o.key)),
    [options, guesses],
  );

  return (
    <>
      {heading}
      {finished ? (
        <Reveal track={track} won={won} attempts={guesses.length} onNext={onNext} nextLabel={nextLabel} />
      ) : (
        <ol className="attempts">
          {STEPS.map((_, i) => {
            const g = guesses[i];
            return (
              <li key={i} className={g ? g.kind : i === attempt ? "current" : ""}>
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
          <div className="player-controls">
            <button
              className="replay-btn"
              onClick={player.replay}
              disabled={!player.ready}
              aria-label="Replay from the start"
              title="Replay from the start"
            >
              <ReplayIcon />
            </button>
            <button
              className="play-btn"
              onClick={player.toggle}
              disabled={!player.ready && !player.playing}
              aria-label={player.playing ? "Stop" : "Play"}
            >
              {player.playing ? "■" : "▶"}
            </button>
            {/* Balances the replay button, so Play stays centred. */}
            <span className="replay-spacer" aria-hidden />
          </div>
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
          onSkip={() => record({ label: "", kind: "skip" })}
        />
      )}
    </>
  );
}

function ReplayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </svg>
  );
}

const formatTime = (sec: number) => `0:${String(Math.floor(sec)).padStart(2, "0")}`;
