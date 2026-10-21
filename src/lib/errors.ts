/** The Spotify session is gone (refresh failed or was revoked); log in again. */
export class SessionExpiredError extends Error {
  constructor(message = "Your Spotify session expired. Please log in again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** Spotify refused to show a playlist's contents (403/404). */
export class PlaylistAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaylistAccessError";
  }
}

/** Turns fetch() TypeErrors into something readable. */
export function describeError(err: unknown): string {
  if (err instanceof TypeError) return "Network error — check your connection and try again.";
  if (err instanceof Error) return err.message;
  return String(err);
}
