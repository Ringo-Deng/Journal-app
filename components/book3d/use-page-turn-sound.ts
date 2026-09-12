"use client";

import { useCallback, useEffect, useRef } from "react";

type PageTurnDirection = -1 | 1;
type PageTurnAudio = {
  forward: HTMLAudioElement;
  backward: HTMLAudioElement;
};

export function usePageTurnSound() {
  const pageTurnAudio = useRef<PageTurnAudio | null>(null);

  useEffect(() => {
    const forward = new Audio("/sounds/mixkit-single-book-paging-1101-first.wav");
    const backward = new Audio("/sounds/mixkit-single-book-paging-1101-second.wav");
    for (const audio of [forward, backward]) {
      audio.preload = "auto";
      audio.volume = 0.22;
      audio.load();
    }
    pageTurnAudio.current = { forward, backward };
    return () => {
      forward.pause();
      backward.pause();
      pageTurnAudio.current = null;
    };
  }, []);

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
