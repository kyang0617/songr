// Points for a correct guess: MAX_POINTS with only the first second
// unlocked, down to MIN_POINTS with the whole clip unlocked, in proportion
// to the seconds unlocked. Players unlock time by skipping, by guessing
// wrong, or by picking any point on the progress bar. Wrong answers score 0.

import { STEPS } from "../components/Round";

export const MAX_POINTS = 10_000;
export const MIN_POINTS = 2_000;

/** Points before any difficulty multiplier, for a correct guess with `unlockedSec` unlocked. */
export function basePoints(unlockedSec: number): number {
  const first = STEPS[0];
  const last = STEPS[STEPS.length - 1];
  const used = Math.min(1, Math.max(0, (unlockedSec - first) / (last - first)));
  return Math.round(MAX_POINTS - used * (MAX_POINTS - MIN_POINTS));
}

export const formatPoints = (points: number) => points.toLocaleString("en-US");
