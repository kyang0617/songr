import { useCallback, useEffect, useState } from "react";
import { describeError } from "./lib/errors";
import { Game } from "./components/Game";
import { Login } from "./components/Login";
import { PlaylistLoader } from "./components/PlaylistLoader";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { deezer } from "./sources/deezer";
import { spotify } from "./sources/spotify";
import { handleCallback, isLoggedIn, logout } from "./sources/spotify/auth";
import type { PlayableTrack, PlaylistSummary } from "./sources/types";

// Swap these to change where playlists or audio come from.
const playlistSource = spotify;
const audioSource = deezer;

type Screen =
  | { name: "callback" }
  | { name: "login"; error?: string }
  | { name: "playlists" }
  | { name: "loading"; playlist: PlaylistSummary }
  | { name: "game"; playlist: PlaylistSummary; tracks: PlayableTrack[]; totalTracks: number };

function initialScreen(): Screen {
  if (window.location.pathname === "/callback") return { name: "callback" };
  return isLoggedIn() ? { name: "playlists" } : { name: "login" };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  useEffect(() => {
    if (screen.name !== "callback") return;
    handleCallback()
      .then(() => setScreen({ name: "playlists" }))
      .catch((err) => setScreen({ name: "login", error: describeError(err) }))
      .finally(() => window.history.replaceState(null, "", "/"));
  }, [screen.name]);

  const onSessionExpired = useCallback((message: string) => {
    logout();
    setScreen({ name: "login", error: message });
  }, []);

  const onReady = useCallback(
    (tracks: PlayableTrack[], totalTracks: number) =>
      setScreen((s) => (s.name === "loading" ? { name: "game", playlist: s.playlist, tracks, totalTracks } : s)),
    [],
  );

  const toPlaylists = useCallback(() => setScreen({ name: "playlists" }), []);

  return (
    <main className="app">
      {screen.name === "callback" && <p className="muted center">Logging in…</p>}
      {screen.name === "login" && <Login error={screen.error} />}
      {screen.name === "playlists" && (
        <PlaylistPicker
          source={playlistSource}
          onPick={(playlist) => setScreen({ name: "loading", playlist })}
          onLogout={() => {
            logout();
            setScreen({ name: "login" });
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
