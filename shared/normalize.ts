// Title/artist cleanup shared by the browser (suggestions, guess checking)
// and the server (Deezer matching).

// Words that mark a bracketed or dashed suffix as "version noise" rather than
// part of the song's name. Remix/mix is deliberately NOT here: a remix is a
// different song as far as guessing goes.
const NOISE =
  "remaster(?:ed)?|\\d{4} remaster|live|radio edit|edit|single version|album version|" +
  "version|mono|stereo|deluxe|explicit|clean|bonus track|demo|anniversary|" +
  "feat\\.?|ft\\.?|featuring|with|from";

// "Song (Remastered 2011)", "Song [feat. X]", "Song (with X)"
const BRACKETED = new RegExp(`\\s*[(\\[][^)\\]]*\\b(?:${NOISE})\\b[^)\\]]*[)\\]]`, "gi");
// "Song - Live at Wembley", "Song - 2011 Remaster", "Song - Radio Edit"
const DASHED = new RegExp(`\\s+[-–—]\\s+[^-–—]*\\b(?:${NOISE})\\b.*$`, "i");
// "Song feat. X" with no brackets
const TRAILING_FEAT = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

/** Human-readable cleaned title, e.g. "Let It Be - Remastered 2009" → "Let It Be". */
export function cleanTitle(title: string): string {
  const cleaned = title
    .replace(BRACKETED, "")
    .replace(DASHED, "")
    .replace(TRAILING_FEAT, "")
    .trim();
  return cleaned || title.trim();
}

/** Lowercase, accent-free, punctuation-free key for comparing strings. */
export function matchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const titleKey = (title: string) => matchKey(cleanTitle(title));

export const artistKey = (artist: string) => matchKey(artist).replace(/^the /, "");

/** True if the two keys are equal or one contains the other (non-trivially). */
export function looselyEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.includes(short);
}
