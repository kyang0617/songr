import { artistKey, cleanTitle, titleKey } from "../../shared/normalize";
import type { GuessOption } from "../components/GuessInput";

/**
 * Identifies a song for guess checking. Two tracks are the same song if their
 * cleaned title and first artist match (e.g. an original and its remaster).
 */
export const songKey = (title: string, artist: string) => `${titleKey(title)}|${artistKey(artist)}`;

/** Deduplicated, sorted "Title – Artist" suggestions. */
export function toGuessOptions(songs: { title: string; artists: string[] }[]): GuessOption[] {
  const byKey = new Map<string, GuessOption>();
  for (const s of songs) {
    const key = songKey(s.title, s.artists[0] ?? "");
    if (!byKey.has(key)) byKey.set(key, { key, label: `${cleanTitle(s.title)} – ${s.artists.join(", ")}` });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}
