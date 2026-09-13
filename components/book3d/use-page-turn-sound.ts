"use client";

import { useCallback, useEffect, useRef } from "react";

type PageTurnDirection = -1 | 1;
type PageTurnAudio = {
  forward: HTMLAudioElement;
  backward: HTMLAudioElement;
};
type PageTurnSoundOptions = {
  forwardSource?: string;
  backwardSource?: string;
  volume?: number;
};

export function usePageTurnSound({
  forwardSource = "/sounds/mixkit-single-book-paging-1101-first.wav",
  backwardSource = "/sounds/mixkit-single-book-paging-1101-second.wav",
  volume = 0.22,
}: PageTurnSoundOptions = {}) {
  const pageTurnAudio = useRef<PageTurnAudio | null>(null);

  useEffect(() => {
    const forward = new Audio(forwardSource);
    const backward = new Audio(backwardSource);
    for (const audio of [forward, backward]) {
      audio.preload = "auto";
      audio.volume = volume;
      audio.load();
    }
    pageTurnAudio.current = { forward, backward };
    return () => {
      forward.pause();
      backward.pause();
      pageTurnAudio.current = null;
    };
  }, [backwardSource, forwardSource, volume]);

  return useCallback((direction: PageTurnDirection) => {
    const sounds = pageTurnAudio.current;
    if (!sounds) return;
    sounds.forward.pause();
    sounds.backward.pause();
    const audio = direction === 1 ? sounds.forward : sounds.backward;
    if (audio.readyState > 0) audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);
}
