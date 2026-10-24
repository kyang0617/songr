import { useState, type PointerEvent } from "react";

interface Props {
  /** Seconds represented by the full width of the bar. */
  totalSec: number;
  /** Seconds the player is currently allowed to hear. */
  unlockedSec: number;
  /** Current playback position in seconds. */
  positionSec: number;
  /** Segment boundaries to mark, in seconds. */
  markers?: number[];
  /** Makes the bar pickable, like a video's: called with the second picked (to 0.1s). */
  onSelect?: (sec: number) => void;
  /** The second under the pointer while hovering or dragging, or null. */
  onPreview?: (sec: number | null) => void;
}

export function ProgressBar({ totalSec, unlockedSec, positionSec, markers = [], onSelect, onPreview }: Props) {
  const [preview, setPreview] = useState<number | null>(null);
  const pct = (sec: number) => `${Math.min(100, (sec / totalSec) * 100)}%`;

  const show = (sec: number | null) => {
    setPreview(sec);
    onPreview?.(sec);
  };
  const secAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(fraction * totalSec * 10) / 10;
  };
  // Pointer capture keeps a drag going when it leaves the bar.
  const handlers = onSelect && {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      show(secAt(e));
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => show(secAt(e)),
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (e.pointerType !== "mouse") show(null); // touch has no hover to keep showing
      onSelect(secAt(e));
    },
    onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) show(null);
    },
    onPointerCancel: () => show(null),
  };

  return (
    <div className={`progress-track ${onSelect ? "pickable" : ""}`} {...handlers}>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={unlockedSec} aria-valuenow={positionSec}>
        <div className="progress-unlocked" style={{ width: pct(unlockedSec) }} />
        {preview !== null && preview > unlockedSec && (
          <div className="progress-preview" style={{ left: pct(unlockedSec), width: pct(preview - unlockedSec) }} />
        )}
        <div className="progress-played" style={{ width: pct(positionSec) }} />
        {markers.map((m) => (
          <div key={m} className="progress-marker" style={{ left: pct(m) }} />
        ))}
      </div>
      {preview !== null && <div className="progress-thumb" style={{ left: pct(preview) }} />}
    </div>
  );
}
