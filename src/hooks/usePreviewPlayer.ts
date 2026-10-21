import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays `url` from the start and stops at `limitSec`. Uses requestAnimationFrame
 * to check the position (the audio "timeupdate" event only fires ~4x/second,
 * far too coarse for a 1-second clip).
 */
export function usePreviewPlayer(url: string | null, limitSec: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const limitRef = useRef(limitSec);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  limitRef.current = limitSec;

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    setReady(false);
    setError(null);
    setPosition(0);
    if (!url) return;

    const audio = new Audio();
    audio.preload = "auto";
    audio.oncanplaythrough = () => setReady(true);
    audio.onerror = () => setError("This preview couldn't be loaded.");
    audio.onended = () => stop();
    audio.src = url;
    audioRef.current = audio;

    return () => {
      cancelAnimationFrame(frameRef.current);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      setPlaying(false);
    };
  }, [url, stop]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(frameRef.current);
    audio.currentTime = 0;
    setPosition(0);
    try {
      await audio.play();
    } catch {
      setError("Playback was blocked. Tap play again.");
      return;
    }
    setPlaying(true);
    const tick = () => {
      if (audio.currentTime >= limitRef.current) {
        audio.pause();
        setPosition(limitRef.current);
        setPlaying(false);
        return;
      }
      setPosition(audio.currentTime);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const toggle = useCallback(() => (playing ? stop() : play()), [playing, play, stop]);

  return { playing, position, ready, error, play, stop, toggle };
}
