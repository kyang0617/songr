import { useEffect, useMemo, useState } from "react";
import { DAILY_LENGTH, type DailyGenre } from "../../shared/daily";
import {
  DIFFICULTY_LABELS,
  fetchDailyPuzzle,
  loadProgress,
  saveProgress,
  shareText,
  timeUntilTomorrow,
  type DailyProgress,
} from "../lib/daily";
import { describeError } from "../lib/errors";
import { toGuessOptions } from "../lib/songs";
import { deezer } from "../sources/deezer";
import type { GuessOption } from "./GuessInput";
import { Round, type RoundResult } from "./Round";

interface Props {
  genre: DailyGenre;
  date: string;
  onExit: () => void;
}

/** Five songs of increasing difficulty, the same for everyone on a given day. */
export function Daily({ genre, date, onExit }: Props) {
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [options, setOptions] = useState<GuessOption[]>([]);
  // The song on screen. Lags behind progress.results while a reveal is shown.
  const [index, setIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Load the puzzle (and any saved progress for today).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchDailyPuzzle(genre.id, date)
      .then((puzzle) => {
        if (cancelled) return;
        const saved = loadProgress(date, genre.id) ?? { tracks: puzzle.tracks, results: [] };
        setProgress(saved);
        setIndex(saved.results.length);
        const pool = puzzle.pool.map((p) => ({ title: p.title, artists: [p.artist] }));
        setOptions(toGuessOptions([...pool, ...saved.tracks]));
      })
      .catch((err) => !cancelled && setError(describeError(err)));
    return () => {
      cancelled = true;
    };
  }, [genre.id, date, attempt]);

  // Fetch a fresh preview URL for the current song.
  const track = progress && index < DAILY_LENGTH ? progress.tracks[index] : null;
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewMissing(false);
    deezer
      .getPreviewUrl(track.audioId)
      .then((url) => {
        if (cancelled) return;
        if (url) setPreviewUrl(url);
        else setPreviewMissing(true);
      })
      .catch((err) => !cancelled && setError(describeError(err)));
    return () => {
      cancelled = true;
    };
  }, [track, attempt]);

  const record = (result: RoundResult) => {
    setProgress((p) => {
      if (!p) return p;
      const next = { ...p, results: [...p.results, result] };
      saveProgress(date, genre.id, next);
      return next;
    });
  };

  const skipUnavailable = () => {
    setPreviewMissing(false);
    record({ won: false, guesses: [] });
    setIndex((i) => i + 1);
  };

  return (
    <div className="game">
      <header className="game-header">
        <button className="btn ghost small" onClick={onExit}>
          ← Home
        </button>
        <div className="game-title">
          <h1>Daily SongR · {genre.name}</h1>
          <p className="muted">{formatDate(date)}</p>
        </div>
      </header>

      {progress && <DailyDots results={progress.results} current={index} />}

      {error && (
        <div className="error-box">
          <p>{error}</p>
          <button
            className="btn"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {previewMissing && (
        <div className="error-box">
          <p>This song's preview isn't available right now. It won't count against you.</p>
          <button className="btn" onClick={skipUnavailable}>
            Skip this song
          </button>
        </div>
      )}

      {!progress && !error && <p className="muted center">Building today's puzzle…</p>}
      {track && !previewUrl && !previewMissing && !error && <p className="muted center">Loading song…</p>}

      {track && previewUrl && (
        <Round
          key={index}
          track={track}
          previewUrl={previewUrl}
          options={options}
          onFinish={record}
          onNext={() => setIndex((i) => i + 1)}
          nextLabel={index === DAILY_LENGTH - 1 ? "See results" : "Next song"}
          heading={
            <p className="round-heading">
              Song {index + 1} of {DAILY_LENGTH} · <strong>{DIFFICULTY_LABELS[index]}</strong>
            </p>
          }
        />
      )}

      {progress && index >= DAILY_LENGTH && <Summary genre={genre} date={date} progress={progress} onExit={onExit} />}
    </div>
  );
}

function DailyDots({ results, current }: { results: RoundResult[]; current: number }) {
  return (
    <ol className="daily-dots" aria-label="Progress">
      {Array.from({ length: DAILY_LENGTH }, (_, i) => {
        const r = results[i];
        const cls = r ? (r.won ? "won" : "lost") : i === current ? "current" : "";
        return (
          <li key={i} className={cls} title={DIFFICULTY_LABELS[i]}>
            {i + 1}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ genre, date, progress, onExit }: { genre: DailyGenre; date: string; progress: DailyProgress; onExit: () => void }) {
  const [copied, setCopied] = useState(false);
  const solved = progress.results.filter((r) => r.won).length;
  const text = useMemo(() => shareText(genre.name, date, progress.results), [genre.name, date, progress.results]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to do.
    }
  };

  return (
    <div className="summary">
      <h2 className="center">
        {solved}/{DAILY_LENGTH} solved
      </h2>
      <ul className="summary-list">
        {progress.tracks.map((t, i) => {
          const r = progress.results[i];
          return (
            <li key={t.id} className={r?.won ? "won" : "lost"}>
              {t.coverUrl ? <img src={t.coverUrl} alt="" /> : <div className="cover-placeholder small" />}
              <div className="summary-info">
                <span className="summary-title">{t.title}</span>
                <span className="muted small">
                  {t.artists.join(", ")} · {DIFFICULTY_LABELS[i]}
                </span>
              </div>
              <span className="summary-result">{r?.won ? `${r.guesses.length}/6` : "✕"}</span>
            </li>
          );
        })}
      </ul>
      <pre className="share-preview">{text}</pre>
      <div className="row">
        <button className="btn primary" onClick={share}>
          {copied ? "Copied!" : "Share result"}
        </button>
        <button className="btn ghost" onClick={onExit}>
          Try another genre
        </button>
      </div>
      <p className="muted center small">Next puzzle in {timeUntilTomorrow()}</p>
    </div>
  );
}

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
