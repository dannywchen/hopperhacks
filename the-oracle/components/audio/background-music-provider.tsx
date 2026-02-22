"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";

type BackgroundMusicContextValue = {
  isMusicOn: boolean;
  setIsMusicOn: (value: boolean) => void;
  toggleMusic: () => void;
};

const STORAGE_KEY = "the-oracle.background-music.enabled.v1";
const DEFAULT_MUSIC_ON = true;

const BackgroundMusicContext = createContext<BackgroundMusicContextValue | null>(null);

const musicListeners = new Set<() => void>();

function subscribeToMusic(listener: () => void) {
  musicListeners.add(listener);
  return () => musicListeners.delete(listener);
}

function readMusicPreference() {
  if (typeof window === "undefined") return DEFAULT_MUSIC_ON;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return DEFAULT_MUSIC_ON;
  }
}

function writeMusicPreference(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Ignore write failures.
  }
  musicListeners.forEach((listener) => listener());
}

export function BackgroundMusicProvider({ children }: { children: React.ReactNode }) {
  const isMusicOn = useSyncExternalStore(subscribeToMusic, readMusicPreference, () => DEFAULT_MUSIC_ON);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        musicListeners.forEach((listener) => listener());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isMusicOn) {
      audio.pause();
      audio.muted = true;
      return;
    }

    audio.muted = false;
    void audio.play().catch(() => {
      // Browsers may block autoplay until user interaction.
    });
  }, [isMusicOn]);

  useEffect(() => {
    if (!isMusicOn) return;

    const resumeAudio = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = false;
      void audio.play().catch(() => {
        // Ignore if browser still blocks playback.
      });
    };

    window.addEventListener("pointerdown", resumeAudio, { once: true });
    window.addEventListener("keydown", resumeAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, [isMusicOn]);

  const setIsMusicOn = (value: boolean) => {
    const audio = audioRef.current;
    writeMusicPreference(value);

    if (!audio) return;

    if (!value) {
      audio.pause();
      audio.muted = true;
      return;
    }

    audio.muted = false;
    void audio.play().catch(() => {
      // If this runs outside an allowed gesture, fallback resume listeners still handle it.
    });
  };

  const toggleMusic = () => {
    setIsMusicOn(!isMusicOn);
  };

  const value: BackgroundMusicContextValue = {
    isMusicOn,
    setIsMusicOn,
    toggleMusic,
  };

  return (
    <BackgroundMusicContext.Provider value={value}>
      <audio
        ref={audioRef}
        src="/Hedwig's Theme - John Williams.mp3"
        preload="auto"
        loop
        aria-hidden
        className="hidden"
      />
      {children}
    </BackgroundMusicContext.Provider>
  );
}

export function useBackgroundMusic() {
  const context = useContext(BackgroundMusicContext);
  if (!context) {
    throw new Error("useBackgroundMusic must be used within BackgroundMusicProvider.");
  }
  return context;
}
