// Daily SongR: genre config and the puzzle shape returned by /api/daily.

export const DAILY_LENGTH = 5;

/** One puzzle song. Mirrors the client's PlayableTrack (audioId = Deezer ID). */
export interface DailyTrack {
  id: string;
  audioId: string;
  title: string;
  artists: string[];
  album: string;
  coverUrl: string | null;
  durationMs: number;
  isrc: string | null;
  externalUrl: string;
  externalSite: "Deezer";
  /** 0 (obscure) – 1 (everyone knows it). */
  popularity: number;
}

export interface DailyPuzzle {
  date: string; // YYYY-MM-DD
  genre: string;
  /** DAILY_LENGTH songs, easiest first. */
  tracks: DailyTrack[];
  /** Every song in the genre pool, for guess suggestions. */
  pool: { title: string; artist: string }[];
}

// Genres. Each one pools a few Deezer editorial playlists
// ("Essentials", "Hits", decades) — well-known songs that change slowly, so
// the daily puzzle is stable. Find more with:
//   curl https://api.deezer.com/chart/{genreId}/playlists

export interface DailyGenre {
  id: string;
  name: string;
  playlists: number[];
}

export const DAILY_GENRES: DailyGenre[] = [
  // Pop Essentials, 00s Hits, 90s Hits, 80s Hits
  { id: "pop", name: "Pop", playlists: [1036183001, 248297032, 878989033, 867825522] },
  // Rock Essentials, 2000s Rock, 70s Rock
  { id: "rock", name: "Rock", playlists: [1306931615, 1419215845, 1405240385] },
  // '90s Rap, Rap Bangers, Hot Urban
  { id: "hiphop", name: "Hip-Hop", playlists: [1724212365, 1996494362, 1677006641] },
  // Global Dance Hits, Electronic Hits, Eurodance
  { id: "dance", name: "Dance", playlists: [706093725, 1902101402, 1251129741] },
  // R&B Essentials, R&B Hits, 2000s R&B
  { id: "rnb", name: "R&B", playlists: [1314725125, 1999466402, 2021626162] },
  // Country Essentials, Country Hits
  { id: "country", name: "Country", playlists: [1294431447, 1130102843] },
  // Metal Hits, Hard Rock Essentials, Nu Metal Essentials
  { id: "metal", name: "Metal", playlists: [1388965575, 761604441, 1367442165] },
];

export const findGenre = (id: string) => DAILY_GENRES.find((g) => g.id === id);
