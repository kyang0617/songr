import type { PlayableTrack } from "../sources/types";

interface Props {
  track: PlayableTrack;
  won: boolean;
  attempts: number;
  onNext: () => void;
  nextLabel: string;
}

export function Reveal({ track, won, attempts, onNext, nextLabel }: Props) {
  return (
    <div className="reveal">
      <p className={`reveal-result ${won ? "won" : "lost"}`}>
        {won ? `Got it in ${attempts} ${attempts === 1 ? "try" : "tries"}!` : "Out of attempts — it was:"}
      </p>
      <div className="reveal-card">
        {track.coverUrl ? (
          <img className="reveal-cover" src={track.coverUrl} alt={`${track.album} cover`} />
        ) : (
          <div className="reveal-cover placeholder" />
        )}
        <div className="reveal-info">
          <h2>{track.title}</h2>
          <p className="reveal-artist">{track.artists.join(", ")}</p>
          <p className="reveal-album">{track.album}</p>
          <a className="external-link" href={track.externalUrl} target="_blank" rel="noreferrer">
            Open in {track.externalSite} ↗
          </a>
        </div>
      </div>
      <button className="btn primary wide" onClick={onNext} autoFocus>
        {nextLabel}
      </button>
    </div>
  );
}
