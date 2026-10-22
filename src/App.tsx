import { useCallback, useEffect, useState } from "react";
import type { GameSettings } from "../shared/game";
import { describeError } from "./lib/errors";
import { Game } from "./components/Game";
import { Home } from "./components/Home";
import { PlaylistLoader } from "./components/PlaylistLoader";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { QuickPlay } from "./components/QuickPlay";
import { deezer } from "./sources/deezer";
import { spotify } from "./sources/spotify";
import { handleCallback, logout } from "./sources/spotify/auth";
import type { PlayableTrack, PlaylistSummary } from "./sources/types";

// Swap these to change where playlists or audio come from.
const playlistSource = spotify;
const audioSource = deezer;

type Screen =
  | { name: "callback" }
  | { name: "home"; error?: string }
  // `game` counts games played, so "Play again" remounts with a fresh game.
  | { name: "play"; settings: GameSettings; game: number }
  | { name: "playlists" }
  | { name: "loading"; playlist: PlaylistSummary }
  | { name: "game"; playlist: PlaylistSummary; tracks: PlayableTrack[]; totalTracks: number };

function initialScreen(): Screen {
  if (window.location.pathname === "/callback") return { name: "callback" };
  return { name: "home" };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  useEffect(() => {
    if (screen.name !== "callback") return;
    handleCallback()
      .then(() => setScreen({ name: "playlists" }))
      .catch((err) => setScreen({ name: "home", error: describeError(err) }))
      .finally(() => window.history.replaceState(null, "", "/"));
  }, [screen.name]);

  const onSessionExpired = useCallback((message: string) => {
    logout();
    setScreen({ name: "home", error: message });
  }, []);

  const onReady = useCallback(
    (tracks: PlayableTrack[], totalTracks: number) =>
      setScreen((s) => (s.name === "loading" ? { name: "game", playlist: s.playlist, tracks, totalTracks } : s)),
    [],
  );

  const toPlaylists = useCallback(() => setScreen({ name: "playlists" }), []);
  const toHome = useCallback(() => setScreen({ name: "home" }), []);

  return (
    <main className="app">
      {screen.name === "callback" && <p className="muted center">Logging in…</p>}
      {screen.name === "home" && (
        <Home
          error={screen.error}
          onPlay={(settings) => setScreen({ name: "play", settings, game: 0 })}
          onPlaylists={toPlaylists}
        />
      )}
      {screen.name === "play" && (
        <QuickPlay
          key={screen.game}
          settings={screen.settings}
          onExit={toHome}
          onPlayAgain={() => setScreen((s) => (s.name === "play" ? { ...s, game: s.game + 1 } : s))}
        />
      )}
      {screen.name === "playlists" && (
        <PlaylistPicker
          source={playlistSource}
          onPick={(playlist) => setScreen({ name: "loading", playlist })}
          onHome={toHome}
          onLogout={() => {
            logout();
            toHome();
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
      {screen.name === "loading" && (
        <PlaylistLoader
          playlist={screen.playlist}
          playlistSource={playlistSource}
          audioSource={audioSource}
          onReady={onReady}
          onBack={toPlaylists}
          onSessionExpired={onSessionExpired}
        />
      )}
      {screen.name === "game" && (
        <Game
          // Remount (fresh deck and stats) for each new game.
          key={screen.playlist.id}
          playlist={screen.playlist}
          tracks={screen.tracks}
          totalTracks={screen.totalTracks}
          onExit={toPlaylists}
        />
      )}
    </main>
  );
}
