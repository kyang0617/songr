// Spotify as a PlaylistSource.
// Uses the post-February-2026 Web API shape: GET /playlists/{id}/items, with
// `items`/`item` replacing `tracks`/`track`. Old field names are still read as
// a fallback.

import { PlaylistAccessError, SessionExpiredError } from "../../lib/errors";
import type { PlaylistSource, PlaylistSummary, Track } from "../types";
import { getAccessToken, logout } from "./auth";

const API = "https://api.spotify.com/v1";

interface Page<T> {
  items: T[];
  next: string | null;
}

interface SpotifyTrack {
  id: string | null;
  type: string;
  name: string;
  is_local?: boolean;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_ids?: { isrc?: string };
  external_urls: { spotify: string };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  collaborative: boolean;
  images: { url: string }[] | null;
  owner: { id: string; display_name: string | null };
  items?: { total: number };
  tracks?: { total: number };
}

async function spotifyGet<T>(urlOrPath: string, retried = false): Promise<T> {
  const url = urlOrPath.startsWith("http") ? urlOrPath : API + urlOrPath;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await getAccessToken(retried)}` } });

  if (res.status === 401) {
    if (!retried) return spotifyGet<T>(urlOrPath, true); // token rejected: refresh once
    logout();
    throw new SessionExpiredError();
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 2);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return spotifyGet<T>(urlOrPath, retried);
  }
  if (res.status === 403 || res.status === 404) {
    throw new PlaylistAccessError(
      "Spotify won't share this playlist's tracks. Apps in development mode can only read " +
        "playlists you own or collaborate on — try one of your own playlists.",
    );
  }
  if (!res.ok) throw new Error(`Spotify request failed (HTTP ${res.status}).`);
  return res.json();
}

async function getAll<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: Page<T> = await spotifyGet<Page<T>>(next);
    all.push(...page.items);
    next = page.next;
  }
  return all;
}

export const spotify: PlaylistSource = {
  async listPlaylists(): Promise<PlaylistSummary[]> {
    const [me, playlists] = await Promise.all([
      spotifyGet<{ id: string }>("/me"),
      getAll<SpotifyPlaylist | null>("/me/playlists?limit=50"),
    ]);
    return playlists
      .filter((p): p is SpotifyPlaylist => p !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        coverUrl: p.images?.[0]?.url ?? null,
        trackCount: p.items?.total ?? p.tracks?.total ?? null,
        ownerName: p.owner.display_name ?? p.owner.id,
        isOwn: p.owner.id === me.id || p.collaborative,
      }));
  },

  async getTracks(playlistId: string): Promise<Track[]> {
    type Entry = { item?: SpotifyTrack | null; track?: SpotifyTrack | null };
    const entries = await getAll<Entry>(`/playlists/${playlistId}/items?limit=50&additional_types=track`);

    const seen = new Set<string>();
    const tracks: Track[] = [];
    for (const entry of entries) {
      const t = entry.item ?? entry.track;
      // Skip podcast episodes, local files, removed tracks and duplicates.
      if (!t || t.type !== "track" || t.is_local || !t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      tracks.push({
        id: t.id,
        title: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album.name,
        coverUrl: t.album.images[0]?.url ?? null,
        durationMs: t.duration_ms,
        isrc: t.external_ids?.isrc ?? null,
        externalUrl: t.external_urls.spotify,
      });
    }
    return tracks;
  },
};
