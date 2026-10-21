// The two seams of the app:
//  - a PlaylistSource provides playlists and track metadata (Spotify today)
//  - an AudioSource turns those tracks into playable previews (Deezer today)

export interface PlaylistSummary {
  id: string;
  name: string;
  coverUrl: string | null;
  /** null when the source doesn't report it (e.g. playlists you don't own). */
  trackCount: number | null;
  ownerName: string;
  /** Whether the current user owns or collaborates on it. */
  isOwn: boolean;
}

export interface Track {
  id: string;
  title: string;
  artists: string[];
  album: string;
  coverUrl: string | null;
  durationMs: number;
  isrc: string | null;
  /** Link to open the track in the source app. */
  externalUrl: string;
}

export interface PlaylistSource {
  listPlaylists(): Promise<PlaylistSummary[]>;
  getTracks(playlistId: string): Promise<Track[]>;
}

export interface AudioSource {
  /**
   * Find audio for each track. Returns trackId → audioId for the tracks that
   * have a preview; unmatched tracks are left out.
   */
  match(tracks: Track[], onProgress: (done: number, total: number) => void): Promise<Map<string, string>>;
  /** Fetch a fresh preview URL (they expire). null if it no longer exists. */
  getPreviewUrl(audioId: string): Promise<string | null>;
  /** Called when an audioId turned out to be unusable. */
  forget(trackId: string): void;
}

/** A track with a known audio match, ready for a round. */
export interface PlayableTrack extends Track {
  audioId: string;
}
