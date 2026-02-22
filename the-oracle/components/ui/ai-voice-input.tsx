/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { Mic } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AIVoiceInputProps {
  onStart?: () => void;
  onStop?: (duration: number) => void;
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  variant?: "full" | "compact";
  visualizerBars?: number;
  demoMode?: boolean;
  demoInterval?: number;
  className?: string;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
  lang?: string;
  disabled?: boolean;
}

export function AIVoiceInput({
  onStart,
  onStop,
  onTranscript,
  onError,
  variant = "full",
  visualizerBars = 48,
  demoMode = false,
  demoInterval = 3000,
  className,
  active,
  onActiveChange,
  lang = "en-US",
  disabled = false,
}: AIVoiceInputProps) {
  const [internalActive, setInternalActive] = useState(false);
  const [time, setTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [isDemo, setIsDemo] = useState(demoMode);
  const wasActiveRef = useRef(false);
  const elapsedRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const manualStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onActiveChangeRef = useRef(onActiveChange);
  const isControlled = typeof active === "boolean";
  const isActive = isControlled ? Boolean(active) : internalActive;
  const barHeights = useMemo(
    () =>
      Array.from({ length: visualizerBars }, (_, i) => {
        const normalized = ((i * 37) % 100) / 100;
        return 20 + normalized * 80;
      }),
    [visualizerBars],
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    elapsedRef.current = time;
  }, [time]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  useEffect(() => {
    if (!isActive) return;
    const intervalId = setInterval(() => {
      setTime((t) => t + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [isActive]);

  useEffect(() => {
    if (isActive === wasActiveRef.current) return;
    if (isActive) {
      onStart?.();
    } else {
      onStop?.(elapsedRef.current);
      setTime(0);
    }
    wasActiveRef.current = isActive;
  }, [isActive, onStart, onStop]);

  useEffect(() => {
    if (!isDemo || isControlled) return;

    let timeoutId: NodeJS.Timeout | undefined;
    const runAnimation = () => {
      setInternalActive(true);
      timeoutId = setTimeout(() => {
        setInternalActive(false);
        timeoutId = setTimeout(runAnimation, 1000);
      }, demoInterval);
    };

    const initialTimeout = setTimeout(runAnimation, 100);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(initialTimeout);
    };
  }, [isDemo, demoInterval, isControlled]);

  useEffect(() => {
    if (isDemo) return;
    if (typeof window === "undefined") return;

    const getSpeechCtor = () =>
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const stopRecognition = () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      manualStopRef.current = true;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {}
    };

    if (!isActive) {
      stopRecognition();
      return;
    }

    if (recognitionRef.current) return;

    const SpeechCtor = getSpeechCtor();
    if (!SpeechCtor) {
      onErrorRef.current?.(
        "Voice transcription is not supported in this browser. You can keep typing normally.",
      );
      if (isControlled) {
        onActiveChangeRef.current?.(false);
      } else {
        setInternalActive(false);
        onActiveChangeRef.current?.(false);
      }
      return;
    }

    const recognition = new SpeechCtor();
    manualStopRef.current = false;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = lang;
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) {
          const best = Array.from(result).sort(
            (a: any, b: any) => (b?.confidence ?? 0) - (a?.confidence ?? 0),
          )[0] as any;
          transcript += ` ${best?.transcript ?? result[0]?.transcript ?? ""}`;
        }
      }
      const trimmed = transcript.trim();
      if (!trimmed) return;
      onTranscriptRef.current?.(trimmed);
    };
    recognition.onerror = (event: any) => {
      const detail = typeof event?.error === "string" ? event.error : "unknown";
      if (detail === "no-speech" || detail === "aborted") return;
      onErrorRef.current?.(`Voice transcription issue: ${detail}.`);
      if (isControlled) {
        onActiveChangeRef.current?.(false);
      } else {
        setInternalActive(false);
        onActiveChangeRef.current?.(false);
      }
    };
    recognition.onend = () => {
      const shouldResume = isActiveRef.current && !manualStopRef.current;
      recognitionRef.current = null;
      if (shouldResume) {
        try {
          recognition.start();
          recognitionRef.current = recognition;
          return;
        } catch {}
      }
      manualStopRef.current = false;
      if (isControlled) {
        onActiveChangeRef.current?.(false);
      } else {
        setInternalActive(false);
        onActiveChangeRef.current?.(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error: any) {
      recognitionRef.current = null;
      onErrorRef.current?.(error?.message ?? "Unable to start voice transcription.");
      if (isControlled) {
        onActiveChangeRef.current?.(false);
      } else {
        setInternalActive(false);
        onActiveChangeRef.current?.(false);
      }
    }

    return () => {
      stopRecognition();
    };
  }, [isActive, isDemo, isControlled, lang]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const setActive = (nextActive: boolean) => {
    if (disabled) return;
    if (isControlled) {
      onActiveChange?.(nextActive);
      return;
    }
    setInternalActive(nextActive);
    onActiveChange?.(nextActive);
  };

  const handleClick = () => {
    if (disabled) return;
    if (isDemo) {
      setIsDemo(false);
      setActive(false);
      return;
    }
    setActive(!isActive);
  };

  if (variant === "compact") {
    return (
      <div className={cn("relative inline-flex items-center", className)}>
        <button
          aria-describedby={isActive ? "voice-status-tooltip" : undefined}
          className={cn(
            "peer inline-flex h-9 w-9 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45",
            isActive
              ? "border-zinc-300 bg-zinc-700 text-zinc-100"
              : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
          )}
          type="button"
          onClick={handleClick}
          aria-label={isActive ? "Stop voice transcription" : "Start voice transcription"}
          disabled={disabled}
        >
          {isActive ? (
            <div
              className="h-3.5 w-3.5 animate-spin rounded-sm bg-zinc-100"
              style={{ animationDuration: "1.4s" }}
            />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>
        <div
          id="voice-status-tooltip"
          className={cn(
            "pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-200 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-all duration-200",
            isActive
              ? "translate-y-0 opacity-100"
              : "translate-y-1 opacity-0",
          )}
          role="status"
          aria-live="polite"
        >
          Listening... {formatTime(time)}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full py-2", className)}>
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center gap-2">
        <button
          className={cn(
            "group flex h-14 w-14 items-center justify-center rounded-xl transition-colors",
            isActive ? "bg-zinc-800" : "bg-zinc-900 hover:bg-zinc-800",
          )}
          type="button"
          onClick={handleClick}
        >
          {isActive ? (
            <div
              className="h-5 w-5 animate-spin cursor-pointer rounded-sm bg-zinc-100 transition duration-700"
              style={{ animationDuration: "1.8s" }}
            />
          ) : (
            <Mic className="h-5 w-5 text-zinc-300" />
          )}
        </button>

        <span
          className={cn(
            "font-mono text-xs transition-opacity duration-300",
            isActive ? "text-zinc-300" : "text-zinc-500",
          )}
        >
          {formatTime(time)}
        </span>

        <div className="flex h-4 w-56 items-center justify-center gap-0.5">
          {barHeights.map((height, i) => (
            <div
              key={i}
              className={cn(
                "w-0.5 rounded-full transition-all duration-300",
                isActive
                  ? "animate-pulse bg-zinc-300/60"
                  : "h-1 bg-zinc-700",
              )}
              style={
                isActive && isClient
                  ? {
                      height: `${height}%`,
                      animationDelay: `${i * 0.03}s`,
                    }
                  : undefined
              }
            />
          ))}
        </div>

      </div>
    </div>
  );
}
