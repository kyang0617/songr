import { DAILY_LENGTH, type DailyPuzzle, type DailyTrack } from "../../shared/daily";
import type { RoundResult } from "../components/Round";
import { STEPS } from "../components/Round";
import { readJSON, writeJSON } from "./storage";

export const DIFFICULTY_LABELS = ["Easy", "Medium", "Tricky", "Hard", "Expert"];

/** Today's date in the player's time zone, as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchDailyPuzzle(genre: string, date: string): Promise<DailyPuzzle> {
  const res = await fetch(`/api/daily?genre=${encodeURIComponent(genre)}&date=${date}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Couldn't load today's puzzle (HTTP ${res.status}).`);
  return body as DailyPuzzle;
}

// --- progress ---------------------------------------------------------------
// Saved per date + genre. The puzzle's tracks are saved with the results, so
// a reload shows the same songs even if the server's puzzle changed. (The
// guess pool isn't saved: it's large, and only needed while playing.)

export interface DailyProgress {
  tracks: DailyTrack[];
  results: RoundResult[];
}

const progressKey = (date: string, genre: string) => `songr.daily.${date}.${genre}`;

export const loadProgress = (date: string, genre: string) =>
  readJSON<DailyProgress | null>(progressKey(date, genre), null);

export const saveProgress = (date: string, genre: string, progress: DailyProgress) =>
  writeJSON(progressKey(date, genre), progress);

export const isComplete = (p: DailyProgress | null) => (p?.results.length ?? 0) >= DAILY_LENGTH;

// --- sharing ----------------------------------------------------------------

/** e.g. "SongR Daily · Pop · 2026-10-21 · 4/5" plus one emoji row per song. */
export function shareText(genreName: string, date: string, results: RoundResult[]): string {
  const solved = results.filter((r) => r.won).length;
  const rows = results.map((r) =>
    STEPS.map((_, i) => {
      const g = r.guesses[i];
      if (!g) return "⬜";
      return g.kind === "correct" ? "🟩" : g.kind === "wrong" ? "🟥" : "⬛";
    }).join(""),
  );
  return [`SongR Daily · ${genreName} · ${date} · ${solved}/${results.length}`, ...rows].join("\n");
}

/** "5h 12m" until local midnight. */
export function timeUntilTomorrow(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const minutes = Math.ceil((midnight.getTime() - now.getTime()) / 60_000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
