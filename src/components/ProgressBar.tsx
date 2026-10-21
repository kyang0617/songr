interface Props {
  /** Seconds represented by the full width of the bar. */
  totalSec: number;
  /** Seconds the player is currently allowed to hear. */
  unlockedSec: number;
  /** Current playback position in seconds. */
  positionSec: number;
  /** Segment boundaries to mark, in seconds. */
  markers?: number[];
}

export function ProgressBar({ totalSec, unlockedSec, positionSec, markers = [] }: Props) {
  const pct = (sec: number) => `${Math.min(100, (sec / totalSec) * 100)}%`;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={unlockedSec} aria-valuenow={positionSec}>
      <div className="progress-unlocked" style={{ width: pct(unlockedSec) }} />
      <div className="progress-played" style={{ width: pct(positionSec) }} />
      {markers.map((m) => (
        <div key={m} className="progress-marker" style={{ left: pct(m) }} />
      ))}
    </div>
  );
}
