import { useEffect, useMemo, useState } from "react";
import { GAME_LENGTH, type GameSettings, type GameTrack } from "../../shared/game";
import { describeSettings, DIFFICULTY_LABELS, fetchGame, shareText } from "../lib/game";
import { describeError } from "../lib/errors";
import { toGuessOptions } from "../lib/songs";
import { deezer } from "../sources/deezer";
import type { GuessOption } from "./GuessInput";
import { Round, type RoundResult } from "./Round";

interface Props {
  settings: GameSettings;
  onExit: () => void;
  onPlayAgain: () => void;
}

/** Five random songs from the chosen genres and years, easiest first. */
export function QuickPlay({ settings, onExit, onPlayAgain }: Props) {
  const [tracks, setTracks] = useState<GameTrack[] | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [options, setOptions] = useState<GuessOption[]>([]);
  // The song on screen. Lags behind results while a reveal is shown.
  const [index, setIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Generate the game. A retry after a failed request asks for a new one.
  useEffect(() => {
    if (tracks) return;
    let cancelled = false;
    setError(null);
    fetchGame(settings)
      .then((game) => {
        if (cancelled) return;
        setTracks(game.tracks);
        const pool = game.pool.map((p) => ({ title: p.title, artists: [p.artist] }));
        setOptions(toGuessOptions([...pool, ...game.tracks]));
      })
      .catch((err) => !cancelled && setError(describeError(err)));
    return () => {
      cancelled = true;
    };
  }, [settings, tracks, attempt]);

  // Fetch a fresh preview URL for the current song.
  const track = tracks && index < GAME_LENGTH ? tracks[index] : null;
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

  const record = (result: RoundResult) => setResults((r) => [...r, result]);

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
          <h1>Quick play</h1>
          <p className="muted">{describeSettings(settings)}</p>
        </div>
      </header>

      {tracks && <GameDots results={results} current={index} />}

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

      {!tracks && !error && <p className="muted center">Picking songs…</p>}
      {track && !previewUrl && !previewMissing && !error && <p className="muted center">Loading song…</p>}

      {track && previewUrl && (
        <Round
          key={index}
          track={track}
          previewUrl={previewUrl}
          options={options}
          onFinish={record}
          onNext={() => setIndex((i) => i + 1)}
          nextLabel={index === GAME_LENGTH - 1 ? "See results" : "Next song"}
          heading={
            <p className="round-heading">
              Song {index + 1} of {GAME_LENGTH} · <strong>{DIFFICULTY_LABELS[index]}</strong>
            </p>
          }
        />
      )}

      {tracks && index >= GAME_LENGTH && (
        <Summary settings={settings} tracks={tracks} results={results} onExit={onExit} onPlayAgain={onPlayAgain} />
      )}
    </div>
  );
}

function GameDots({ results, current }: { results: RoundResult[]; current: number }) {
  return (
    <ol className="game-dots" aria-label="Progress">
      {Array.from({ length: GAME_LENGTH }, (_, i) => {
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

interface SummaryProps {
  settings: GameSettings;
  tracks: GameTrack[];
  results: RoundResult[];
  onExit: () => void;
  onPlayAgain: () => void;
}

function Summary({ settings, tracks, results, onExit, onPlayAgain }: SummaryProps) {
  const [copied, setCopied] = useState(false);
  const solved = results.filter((r) => r.won).length;
  const text = useMemo(() => shareText(settings, results), [settings, results]);

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
        {solved}/{GAME_LENGTH} solved
      </h2>
      <ul className="summary-list">
        {tracks.map((t, i) => {
          const r = results[i];
          return (
            <li key={t.id} className={r?.won ? "won" : "lost"}>
              {t.coverUrl ? <img src={t.coverUrl} alt="" /> : <div className="cover-placeholder small" />}
              <div className="summary-info">
                <span className="summary-title">{t.title}</span>
                <span className="muted small">
                  {t.artists.join(", ")} · {t.year} · {DIFFICULTY_LABELS[i]}
                </span>
              </div>
              <span className="summary-result">{r?.won ? `${r.guesses.length}/6` : "✕"}</span>
            </li>
          );
        })}
      </ul>
      <pre className="share-preview">{text}</pre>
      <div className="row">
        <button className="btn primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button className="btn" onClick={share}>
          {copied ? "Copied!" : "Share result"}
        </button>
        <button className="btn ghost" onClick={onExit}>
          Change settings
        </button>
      </div>
    </div>
  );
}
