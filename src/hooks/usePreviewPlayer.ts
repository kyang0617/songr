import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays `url` up to `limitSec`. `play` picks up where playback last stopped
 * (so after a skip unlocks more, you hear only the new part), or starts over
 * once everything unlocked has been heard. `replay` always starts from 0,
 * `seek` from any point heard so far, and `playTo` raises the limit and
 * plays on without waiting for the next render.
 * Uses requestAnimationFrame to check the position (the audio "timeupdate"
 * event only fires ~4x/second, far too coarse for a 1-second clip).
 */
export function usePreviewPlayer(url: string | null, limitSec: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const limitRef = useRef(limitSec);
  // Where playback stopped, in seconds. A ref, so play() reads the latest.
  const positionRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  limitRef.current = limitSec;

  const moveTo = useCallback((sec: number) => {
    positionRef.current = sec;
    setPosition(sec);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      moveTo(Math.min(audio.currentTime, limitRef.current));
    }
    setPlaying(false);
  }, [moveTo]);

  useEffect(() => {
    setReady(false);
    setError(null);
    moveTo(0);
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
  }, [url, stop, moveTo]);

  const playFrom = useCallback(async (start: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(frameRef.current);
    audio.currentTime = start;
    moveTo(start);
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
        moveTo(limitRef.current);
        setPlaying(false);
        return;
      }
      moveTo(audio.currentTime);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [moveTo]);

  // Resume, unless everything unlocked has been heard (within a few
  // milliseconds: the stop check runs once per frame).
  const play = useCallback(() => {
    const at = positionRef.current;
    return playFrom(at < limitRef.current - 0.05 ? at : 0);
  }, [playFrom]);

  const replay = useCallback(() => playFrom(0), [playFrom]);

  const seek = useCallback((sec: number) => playFrom(Math.min(sec, limitRef.current)), [playFrom]);

  const playTo = useCallback(
    (sec: number) => {
      limitRef.current = sec;
      return play();
    },
    [play],
  );

  const toggle = useCallback(() => (playing ? stop() : play()), [playing, play, stop]);

  return { playing, position, ready, error, play, replay, seek, playTo, stop, toggle };
}
