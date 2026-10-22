import { CATALOG_INDEX } from "../../shared/catalog-index";
import { GAME_LENGTH, GENRES, type Game, type GameSettings } from "../../shared/game";
import type { RoundResult } from "../components/Round";
import { STEPS } from "../components/Round";
import { readJSON, writeJSON } from "./storage";

export const DIFFICULTY_LABELS = ["Easy", "Medium", "Tricky", "Hard", "Expert"];

export const YEAR_MIN = Math.min(...CATALOG_INDEX.map(([year]) => year));
export const YEAR_MAX = Math.max(...CATALOG_INDEX.map(([year]) => year));

const genreMask = (genres: string[]) =>
  GENRES.reduce((mask, g, i) => (genres.includes(g.id) ? mask | (1 << i) : mask), 0);

/** How many catalog songs match the settings (instant; no request). */
export function countSongs({ genres, from, to }: GameSettings): number {
  const mask = genreMask(genres);
  return CATALOG_INDEX.filter(([year, m]) => m & mask && year >= from && year <= to).length;
}

// --- settings (remembered per browser) --------------------------------------

const SETTINGS_KEY = "songr.settings";

export function loadSettings(): GameSettings {
  const saved = readJSON<Partial<GameSettings>>(SETTINGS_KEY, {});
  const genres = (saved.genres ?? []).filter((id) => GENRES.some((g) => g.id === id));
  const clamp = (y: unknown, fallback: number) =>
    typeof y === "number" ? Math.min(YEAR_MAX, Math.max(YEAR_MIN, y)) : fallback;
  const from = clamp(saved.from, YEAR_MIN);
  const to = clamp(saved.to, YEAR_MAX);
  return { genres: genres.length ? genres : [GENRES[0].id], from: Math.min(from, to), to: Math.max(from, to) };
}

export const saveSettings = (settings: GameSettings) => writeJSON(SETTINGS_KEY, settings);

/** "Pop + Rock · 1980–1999" */
export function describeSettings({ genres, from, to }: GameSettings): string {
  const names = GENRES.filter((g) => genres.includes(g.id)).map((g) => g.name);
  const years = from === YEAR_MIN && to === YEAR_MAX ? "All years" : from === to ? `${from}` : `${from}–${to}`;
  return `${names.join(" + ")} · ${years}`;
}

// --- games ------------------------------------------------------------------
// The server avoids songs from the player's recent games, so the most famous
// songs in a range don't come up every time.

const RECENT_KEY = "songr.recent";
const RECENT_LIMIT = 100;

export async function fetchGame(settings: GameSettings): Promise<Game> {
  const params = new URLSearchParams({
    genres: settings.genres.join(","),
    from: String(settings.from),
    to: String(settings.to),
    recent: readJSON<string[]>(RECENT_KEY, []).join(","),
  });
  const res = await fetch(`/api/game?${params}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Couldn't start a game (HTTP ${res.status}).`);
  const game = body as Game;
  const recent = [...game.tracks.map((t) => t.audioId), ...readJSON<string[]>(RECENT_KEY, [])];
  writeJSON(RECENT_KEY, recent.slice(0, RECENT_LIMIT));
  return game;
}

// --- sharing ----------------------------------------------------------------

/** e.g. "SongR · Pop + Rock · 1980–1999 · 4/5" plus one emoji row per song. */
export function shareText(settings: GameSettings, results: RoundResult[]): string {
  const solved = results.filter((r) => r.won).length;
  const rows = results.map((r) =>
    STEPS.map((_, i) => {
      const g = r.guesses[i];
      if (!g) return "⬜";
      return g.kind === "correct" ? "🟩" : g.kind === "wrong" ? "🟥" : "⬛";
    }).join(""),
  );
  return [`SongR · ${describeSettings(settings)} · ${solved}/${GAME_LENGTH}`, ...rows].join("\n");
}
