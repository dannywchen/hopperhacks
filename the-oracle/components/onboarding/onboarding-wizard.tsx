/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  PanelRight,
  Play,
  Volume2,
  VolumeX,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { AIVoiceInput } from "@/components/ui/ai-voice-input";
import { Loader } from "@/components/ui/loader";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { clearEvents } from "@/lib/client/event-store";
import { clearScenarios } from "@/lib/client/scenario-store";
import { saveSetup } from "@/lib/client/setup-store";
import { syncLocalSimulationStateToSupabase } from "@/lib/client/cloud-state";
import { getSupabase } from "@/lib/supabase";
import onboardingDesign from "@/design.json";
import {
  INTERVIEW_DOMAINS,
  SIMULATION_MODE_OPTIONS,
} from "@/lib/onboarding/config";
import type {
  OnboardingAvatar,
  OnboardingDomainReflection,
  OnboardingInterviewDomainId,
  OnboardingInterviewMessage,
  OnboardingLinkedinProfile,
  SimulationHorizonPreset,
  SimulationMode,
  UserSetup,
} from "@/lib/types";

const ONBOARDING_BOOTSTRAP_KEY = "deep-sim.onboarding-bootstrap.v1";
const ONBOARDING_DASHBOARD_TRANSITION_KEY = "deep-sim.onboarding-dashboard-transition.v1";

const ONBOARDING_OUTLINE_VARS: CSSProperties = {
  "--slot-line-width": `${onboardingDesign.outline.slot.lineWidthPx}px`,
  "--slot-corner-segment": `${onboardingDesign.outline.slot.cornerSegmentPx}px`,
  "--slot-side-segment": `${onboardingDesign.outline.slot.sideSegmentPx}px`,
  "--slot-stub-segment": `${onboardingDesign.outline.slot.stubSegmentPx}px`,
  "--slot-step-1": `${onboardingDesign.outline.slot.step1OffsetPx}px`,
  "--slot-step-2": `${onboardingDesign.outline.slot.step2OffsetPx}px`,
  "--slot-radius": `${onboardingDesign.outline.slot.radiusPx}px`,
  "--slot-line-primary": onboardingDesign.outline.slot.linePrimary,
  "--slot-line-secondary": onboardingDesign.outline.slot.lineSecondary,
  "--slot-line-tertiary": onboardingDesign.outline.slot.lineTertiary,
  "--slot-surface-top": onboardingDesign.outline.slot.surfaceTop,
  "--slot-surface-bottom": onboardingDesign.outline.slot.surfaceBottom,
  "--slot-mist-glow": onboardingDesign.outline.slot.mistGlow,
  "--frame-line-width": `${onboardingDesign.outline.frame.lineWidthPx}px`,
  "--frame-corner-segment": `${onboardingDesign.outline.frame.cornerSegmentPx}px`,
  "--frame-side-segment": `${onboardingDesign.outline.frame.sideSegmentPx}px`,
  "--frame-stub-segment": `${onboardingDesign.outline.frame.stubSegmentPx}px`,
  "--frame-step-1": `${onboardingDesign.outline.frame.stepOffsetPx}px`,
  "--frame-radius": `${onboardingDesign.outline.frame.radiusPx}px`,
  "--frame-line-primary": onboardingDesign.outline.frame.linePrimary,
  "--frame-line-secondary": onboardingDesign.outline.frame.lineSecondary,
  "--frame-surface-top": onboardingDesign.outline.frame.surfaceTop,
  "--frame-surface-bottom": onboardingDesign.outline.frame.surfaceBottom,
  "--onboarding-bg-base": onboardingDesign.background.base,
  "--onboarding-bg-mist-blue": onboardingDesign.background.mistBlue,
  "--onboarding-bg-mist-gold": onboardingDesign.background.mistGold,
  "--onboarding-grid-line": onboardingDesign.background.gridLine,
  "--onboarding-grid-line-bold": onboardingDesign.background.gridLineBold,
  "--onboarding-grid-size": `${onboardingDesign.background.gridSizePx}px`,
} as CSSProperties;

type OnboardingStepId = "avatar" | "path" | "resume" | "story" | "simulation";

const STEP_CONTENT: Record<
  OnboardingStepId,
  { title: string; subtitle: string }
> = {
  avatar: {
    title: "Customize Your Sprites",
    subtitle: "Pick a look you'll use for the game simulation later!",
  },
  path: {
    title: "Choose Your Onboarding Path",
    subtitle: "Pick Minimal for a fast setup, or Detailed for deeper personalization.",
  },
  resume: {
    title: "The Oracle needs some context...",
    subtitle: "Upload your resume or answer a few questions to quickly personalize your simulation.",
  },
  story: {
    title: "Guided Interview",
    subtitle: "The more you chat with the oracle, the more accurate the simulation will get for you.",
  },
  simulation: {
    title: "Start your simulation",
    subtitle:
      "We're going to run a simulation based on the information you shared and the conversation. You can always add more context later.",
  },
};

const RESUME_MIN_CHARS = 120;

type OnboardingPath = "minimal" | "guided";

import {
  PixelAvatar,
  SpriteHeadTone,
  SpriteHairStyle,
  SpriteOutfitStyle,
  SpriteParts,
  DEFAULT_SPRITE_PARTS,
  HEAD_TONE_OPTIONS,
  HAIR_STYLE_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  buildSpriteId,
  parseSpriteParts,
  accessoryFromHairStyle,
} from "@/components/shared/pixel-avatar";
import { AvatarCustomizer } from "@/components/shared/avatar-customizer";

type AvatarTab = "hair" | "clothes" | "head";

const SIMULATION_MODE_DETAILS: Record<
  SimulationMode,
  {
    kicker: string;
    bullets: string[];
    horizonPreset: SimulationHorizonPreset;
  }
> = {
  auto_future: {
    kicker: "Auto Future Forecast",
    horizonPreset: "10_years",
    bullets: [
      "AI agents use your full memory + context to imitate how you would likely behave.",
      "The system auto-generates a long timeline with many nodes and projected life changes.",
      "Great for quickly seeing a broad 10-year style outlook and likely outcomes.",
    ],
  },
  manual_step: {
    kicker: "Manual Story Mode",
    horizonPreset: "1_year",
    bullets: [
      "Simulation starts from right now and advances action-by-action, day-by-day.",
      "Each step gives 3 suggested actions, plus you can write your own custom action.",
      "Storyline and metrics update at every node so you can actively steer your future path.",
    ],
  },
};

// Sprite constants imported from pixel-avatar

type ResumeMeta = {
  parser: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  characters: number;
};

type InterviewApiResponse = {
  nextPrompt?: {
    domainId: OnboardingInterviewDomainId;
    question: string;
    action: "follow_up" | "advance_domain";
    rationale: string;
    shouldSuggestSimulate: boolean;
  };
  reflections?: OnboardingDomainReflection[];
  coverage?: Record<OnboardingInterviewDomainId, number>;
  meta?: any;
  error?: string;
};

type ResumeUploadResponse = {
  text: string;
  profile?: OnboardingLinkedinProfile;
  meta: ResumeMeta;
};

type LinkedinIngestResponse = {
  text: string;
  profile: OnboardingLinkedinProfile;
  meta: {
    source: "apify";
    actorId: string;
    itemCount: number;
  };
};

type SpeechTarget = "story";

type InterviewVoiceResponse = {
  error?: string;
};

type InterviewerSpriteListResponse = {
  sprites?: string[];
  error?: string;
};

const DEFAULT_INTERVIEWER_SPRITES = ["/interviewer/sprite_happy.png"];
const AUDIO_READY_TIMEOUT_MS = 2_500;
const AUDIO_PREROLL_DELAY_MS = 120;

function makeId(prefix: string) {
  const uuid = globalThis?.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
  withAuth?: boolean;
};

const ONBOARDING_PROGRESS_IMAGE_STYLE: CSSProperties = {
  width: "105.13%",
  maxWidth: "none",
  height: "auto",
  left: "-3.15%",
  top: "-57.65%",
};

function OnboardingSpriteProgress({ progress }: { progress: number }) {
  const clampedProgress = clamp(Math.round(progress), 1, 100);

  return (
    <div
      className="onboarding-progress-shell"
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedProgress}
    >
      <div className="onboarding-progress-slot" aria-hidden>
        <div
          className="onboarding-progress-fill"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      <div className="onboarding-progress-frame-wrap" aria-hidden>
        <Image
          src="/decors/progress_bars.png"
          alt=""
          width={1536}
          height={1024}
          loading="eager"
          className="onboarding-progress-frame-image"
          sizes="(max-width: 640px) 94vw, 640px"
          style={ONBOARDING_PROGRESS_IMAGE_STYLE}
        />
      </div>
    </div>
  );
}

async function fetchJson<T>(
  url: string,
  options?: FetchJsonOptions,
): Promise<T> {
  const { timeoutMs = 120_000, withAuth = true, ...requestOptions } = options ?? {};
  const controller = new AbortController();
  const timeoutId = globalThis?.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const baseHeaders = new Headers(requestOptions.headers ?? undefined);
    const supabase = withAuth ? getSupabase() : null;

    async function maybeAttachToken(headers: Headers) {
      if (!withAuth || headers.has("Authorization") || !supabase) return;
      const first = await supabase.auth.getSession().catch(() => null);
      let token = first?.data?.session?.access_token ?? null;
      if (!token) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        const second = await supabase.auth.getSession().catch(() => null);
        token = second?.data?.session?.access_token ?? null;
      }
      if (!token) {
        const refreshed = await supabase.auth.refreshSession().catch(() => null);
        token = refreshed?.data?.session?.access_token ?? null;
      }
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    async function executeRequest(headers: Headers) {
      const response = await fetch(url, {
        ...requestOptions,
        headers,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const jsonPayload = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : null;
      return { response, jsonPayload };
    }

    await maybeAttachToken(baseHeaders);
    let { response, jsonPayload } = await executeRequest(baseHeaders);

    if (withAuth && response.status === 401 && supabase) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null);
      const retryToken = refreshed?.data?.session?.access_token ?? null;
      if (retryToken) {
        const retryHeaders = new Headers(requestOptions.headers ?? undefined);
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
        ({ response, jsonPayload } = await executeRequest(retryHeaders));
      }
    }

    if (!response.ok) {
      const message =
        jsonPayload &&
          typeof jsonPayload === "object" &&
          ("error" in jsonPayload || "message" in jsonPayload)
          ? ((jsonPayload as { error?: string; message?: string }).error ??
            (jsonPayload as { error?: string; message?: string }).message ??
            `Request failed: ${response.status}`)
          : response.status === 401
            ? "Unauthorized. Please sign in again."
            : `Request failed: ${response.status}`;
      throw new Error(message);
    }

    if (jsonPayload !== null) {
      return jsonPayload as T;
    }
    return (await response.json()) as T;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(
        `${url} timed out after ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
    throw error;
  } finally {
    if (timeoutId) {
      globalThis?.clearTimeout(timeoutId);
    }
  }
}

async function getAccessTokenOrNull() {
  try {
    const supabase = getSupabase();
    const first = await supabase.auth.getSession();
    let token = first.data.session?.access_token ?? null;
    if (token) return token;

    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
    return token;
  } catch {
    return null;
  }
}

function withTranscript(previous: string, chunk: string) {
  const trimmed = chunk.replace(/\s+/g, " ").trim();
  if (!trimmed) return previous;
  if (!previous.trim()) return trimmed;
  return `${previous.trim()} ${trimmed}`;
}

function lifeStoryFromMessages(messages: OnboardingInterviewMessage[]) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 26_000);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLinkedinUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function emptyCoverage() {
  return Object.fromEntries(
    INTERVIEW_DOMAINS.map((domain) => [domain.id, 0]),
  ) as Record<OnboardingInterviewDomainId, number>;
}

function normalizeCoverage(
  coverage: Record<OnboardingInterviewDomainId, number> | null | undefined,
  reflections: OnboardingDomainReflection[],
) {
  if (coverage) {
    return Object.fromEntries(
      INTERVIEW_DOMAINS.map((domain) => [
        domain.id,
        Math.max(0, Math.min(100, Math.round(coverage[domain.id] ?? 0))),
      ]),
    ) as Record<OnboardingInterviewDomainId, number>;
  }

  const map = emptyCoverage();
  for (const reflection of reflections) {
    map[reflection.domainId] = Math.max(
      map[reflection.domainId],
      Math.max(0, Math.min(100, Math.round(reflection.coverage))),
    );
  }
  return map;
}

function isIgnorablePlaybackError(error: unknown) {
  const name = typeof error === "object" && error ? (error as { name?: string }).name : "";
  const message =
    typeof error === "object" && error ? (error as { message?: string }).message ?? "" : "";
  const normalized = `${name} ${message}`.toLowerCase();
  return (
    normalized.includes("aborterror") ||
    normalized.includes("interrupted by") ||
    normalized.includes("play() request was interrupted")
  );
}

function waitForAudioReady(audio: HTMLAudioElement, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    let timeoutId: number | null = null;

    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("error", onError);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
    const finish = (handler: () => void) => {
      if (done) return;
      done = true;
      cleanup();
      handler();
    };
    const onReady = () => finish(resolve);
    const onError = () =>
      finish(() => reject(new Error("Interviewer voice could not be loaded.")));

    audio.addEventListener("canplaythrough", onReady);
    audio.addEventListener("loadeddata", onReady);
    audio.addEventListener("error", onError);

    timeoutId = window.setTimeout(() => finish(resolve), timeoutMs);

    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      finish(resolve);
    }
  });
}

function getSpeechVoices(synth: SpeechSynthesis) {
  const voices = synth.getVoices();
  return Array.isArray(voices) ? voices : [];
}

function waitForSpeechVoices(synth: SpeechSynthesis, timeoutMs: number) {
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const existing = getSpeechVoices(synth);
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve(getSpeechVoices(synth));
    };
    const onVoicesChanged = () => finish();
    const timeoutId = window.setTimeout(finish, timeoutMs);

    synth.addEventListener("voiceschanged", onVoicesChanged);
  });
}

function pickBestSpeechVoice(voices: SpeechSynthesisVoice[]) {
  if (voices.length === 0) return null;
  const scored = voices
    .map((voice) => {
      const normalizedName = voice.name.toLowerCase();
      const normalizedLang = voice.lang.toLowerCase();
      let score = 0;
      if (voice.localService) score += 5;
      if (voice.default) score += 6;
      if (normalizedLang.startsWith("en-us")) score += 5;
      if (normalizedLang.startsWith("en")) score += 3;
      if (normalizedName.includes("neural")) score += 4;
      if (normalizedName.includes("premium")) score += 3;
      if (normalizedName.includes("natural")) score += 3;
      if (normalizedName.includes("siri")) score += 3;
      if (normalizedName.includes("google")) score += 2;
      if (normalizedName.includes("microsoft")) score += 2;
      if (normalizedName.includes("enhanced")) score += 2;
      if (normalizedName.includes("compact")) score -= 1;
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.voice ?? null;
}

function splitSpeechText(text: string, chunkLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences =
    normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((segment) => segment.trim()) ?? [normalized];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (sentence.length > chunkLength) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let index = 0; index < sentence.length; index += chunkLength) {
        chunks.push(sentence.slice(index, index + chunkLength).trim());
      }
      continue;
    }
    if (!current) {
      current = sentence;
      continue;
    }
    if ((current + " " + sentence).length <= chunkLength) {
      current = `${current} ${sentence}`.trim();
    } else {
      chunks.push(current.trim());
      current = sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function isInterviewMessageDomainId(
  value: string | undefined,
): value is OnboardingInterviewDomainId {
  return Boolean(
    value && INTERVIEW_DOMAINS.some((domain) => domain.id === value),
  );
}

// Redundant sprite functions and types removed

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const [stepIndex, setStepIndex] = useState(0);
  const [onboardingPath, setOnboardingPath] = useState<OnboardingPath | null>(null);
  const [avatarTab, setAvatarTab] = useState<AvatarTab>("hair");
  const [avatar, setAvatar] = useState<OnboardingAvatar>({
    spriteId: buildSpriteId(DEFAULT_SPRITE_PARTS),
    paletteId: "plum",
    accessory: accessoryFromHairStyle(DEFAULT_SPRITE_PARTS.hair),
    expression: "calm",
  });
  const [resumeText, setResumeText] = useState("");
  const [career, setCareer] = useState("");
  const [kids, setKids] = useState("");
  const [sleep, setSleep] = useState("");
  const [risk, setRisk] = useState("medium");
  const [social, setSocial] = useState("ambivert");
  const [extraNotes, setExtraNotes] = useState("");
  const [resumeMeta, setResumeMeta] = useState<ResumeMeta | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [lifeStory, setLifeStory] = useState("");
  const [storyInput, setStoryInput] = useState("");
  const [interviewMessages, setInterviewMessages] = useState<
    OnboardingInterviewMessage[]
  >([]);
  const [interviewReflections, setInterviewReflections] = useState<
    OnboardingDomainReflection[]
  >([]);
  const [coverage, setCoverage] = useState<
    Record<OnboardingInterviewDomainId, number>
  >(emptyCoverage);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [simHorizonPreset, setSimHorizonPreset] =
    useState<SimulationHorizonPreset>(SIMULATION_MODE_DETAILS.manual_step.horizonPreset);
  const [simMode, setSimMode] = useState<SimulationMode>("manual_step");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [activeVoiceTarget, setActiveVoiceTarget] = useState<SpeechTarget | null>(
    null,
  );
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [interviewerSprites, setInterviewerSprites] = useState<string[]>(
    DEFAULT_INTERVIEWER_SPRITES,
  );
  const [interviewerSpriteIndex, setInterviewerSpriteIndex] = useState(0);
  const [autoVoiceEnabled, setAutoVoiceEnabled] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [summonZapActive, setSummonZapActive] = useState(false);
  const [zapBeamStyle, setZapBeamStyle] = useState<CSSProperties | null>(null);
  const storyStageRef = useRef<HTMLDivElement | null>(null);
  const wandAnchorRef = useRef<HTMLSpanElement | null>(null);
  const latestAssistantBubbleRef = useRef<HTMLParagraphElement | null>(null);
  const storyScrollRef = useRef<HTMLDivElement | null>(null);
  const interviewRequestAbortRef = useRef<AbortController | null>(null);
  const interviewRequestIdRef = useRef(0);
  const interviewSpeechRequestIdRef = useRef(0);
  const interviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const interviewAudioObjectUrlRef = useRef<string | null>(null);
  const interviewSpeechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const lastSpokenAssistantIdRef = useRef<string | null>(null);
  const bootstrapAttemptedRef = useRef(false);
  const summonZapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = useMemo(() => {
    if (onboardingPath === "minimal") {
      return ["avatar", "path", "resume", "simulation"] as OnboardingStepId[];
    }
    if (onboardingPath === "guided") {
      return ["avatar", "path", "story", "simulation"] as OnboardingStepId[];
    }
    return ["avatar", "path"] as OnboardingStepId[];
  }, [onboardingPath]);
  const stepId = steps[stepIndex] ?? steps[0];
  const step = STEP_CONTENT[stepId];
  const isPathStep = stepId === "path";
  const isStoryStep = stepId === "story";
  const isSimulationStep = stepId === "simulation";
  const isWideStep = isStoryStep || isPathStep || isSimulationStep;
  const onboardingProgress = useMemo(() => {
    if (stepId === "avatar") return 25;
    if (stepId === "path") return 50;
    if (stepId === "resume" || stepId === "story") return 75;
    if (stepId === "simulation") return 100;
    return 25;
  }, [stepId]);

  const hasManualSignal = useMemo(
    () => career.trim().length > 0 && kids.trim().length > 0 && sleep.trim().length > 0,
    [career, kids, sleep],
  );

  const onboardingResumeText = useMemo(() => {
    return resumeText.trim();
  }, [resumeText]);
  const storyCharCount = useMemo(() => lifeStory.trim().length, [lifeStory]);
  const hasResumeSignal = useMemo(
    () => resumeText.trim().length > RESUME_MIN_CHARS || hasManualSignal,
    [hasManualSignal, resumeText],
  );
  const interviewAnswerCount = useMemo(
    () =>
      interviewMessages.filter((message) => message.role === "user").length,
    [interviewMessages],
  );
  const coveredDomainCount = useMemo(
    () =>
      INTERVIEW_DOMAINS.filter((domain) => (coverage[domain.id] ?? 0) >= 35)
        .length,
    [coverage],
  );
  const averageCoverage = useMemo(() => {
    const values = INTERVIEW_DOMAINS.map((domain) => coverage[domain.id] ?? 0);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [coverage]);
  const simulationAccuracy = useMemo(() => {
    const resumeScore = hasResumeSignal ? 26 : 10;
    const storyScore = clamp(Math.round(storyCharCount / 85), 0, 24);
    const interviewScore = clamp(Math.round(averageCoverage * 0.5), 0, 50);
    return clamp(resumeScore + storyScore + interviewScore, 10, 100);
  }, [averageCoverage, hasResumeSignal, storyCharCount]);
  const interviewQuestionCatalog = useMemo(
    () =>
      INTERVIEW_DOMAINS.map((domain) => ({
        domainId: domain.id,
        label: domain.label,
      })),
    [],
  );
  const latestAssistantMessage = useMemo(
    () =>
      [...interviewMessages]
        .reverse()
        .find((message) => message.role === "assistant") ?? null,
    [interviewMessages],
  );
  const hasAssistantQuestion = useMemo(
    () => interviewMessages.some((message) => message.role === "assistant"),
    [interviewMessages],
  );
  const currentInterviewerSprite =
    interviewerSprites[
    interviewerSpriteIndex % Math.max(1, interviewerSprites.length)
    ] ??
    interviewerSprites[0] ??
    DEFAULT_INTERVIEWER_SPRITES[0];
  const canAdvanceCurrentStep = useMemo(() => {
    if (stepId === "path") {
      return onboardingPath !== null;
    }
    if (stepId === "resume") {
      return hasResumeSignal;
    }
    return true;
  }, [hasResumeSignal, onboardingPath, stepId]);

  const stopInterviewerSpeech = useCallback(() => {
    const audio = interviewAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      interviewAudioRef.current = null;
    }
    const objectUrl = interviewAudioObjectUrlRef.current;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      interviewAudioObjectUrlRef.current = null;
    }
    const synth =
      interviewSpeechSynthesisRef.current ??
      (typeof window !== "undefined" && "speechSynthesis" in window
        ? window.speechSynthesis
        : null);
    if (synth) {
      synth.cancel();
      interviewSpeechSynthesisRef.current = synth;
    }
    setAudioPlaying(false);
  }, []);

  const cancelInterviewerSpeech = useCallback(() => {
    interviewSpeechRequestIdRef.current += 1;
    stopInterviewerSpeech();
  }, [stopInterviewerSpeech]);

  const cycleInterviewerSprite = useCallback(() => {
    setInterviewerSpriteIndex((previous) => {
      if (interviewerSprites.length <= 1) return previous;
      return (previous + 1) % interviewerSprites.length;
    });
  }, [interviewerSprites.length]);

  const speakInterviewerText = useCallback(
    async (text: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (!autoVoiceEnabled && !force) return;
      const message = text.trim();
      if (!message) return;

      const requestId = interviewSpeechRequestIdRef.current + 1;
      interviewSpeechRequestIdRef.current = requestId;
      stopInterviewerSpeech();
      setVoiceError(null);

      const speakWithBrowserVoice = async () => {
        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window) ||
          typeof SpeechSynthesisUtterance === "undefined"
        ) {
          return false;
        }
        const synth = window.speechSynthesis;
        interviewSpeechSynthesisRef.current = synth;
        const voices = await waitForSpeechVoices(synth, 450);
        const bestVoice = pickBestSpeechVoice(voices);
        const chunks = splitSpeechText(message);
        if (chunks.length === 0) return false;

        synth.cancel();
        setAudioPlaying(true);

        return await new Promise<boolean>((resolve) => {
          let index = 0;
          const finish = (result: boolean) => {
            if (interviewSpeechRequestIdRef.current === requestId) {
              setAudioPlaying(false);
            }
            resolve(result);
          };
          const speakNext = () => {
            if (interviewSpeechRequestIdRef.current !== requestId) {
              synth.cancel();
              finish(false);
              return;
            }
            if (index >= chunks.length) {
              finish(true);
              return;
            }
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            if (bestVoice) utterance.voice = bestVoice;
            utterance.lang = bestVoice?.lang || "en-US";
            utterance.rate = 0.97;
            utterance.pitch = 1.02;
            utterance.volume = 1;
            utterance.onend = () => {
              index += 1;
              speakNext();
            };
            utterance.onerror = () => finish(false);
            synth.speak(utterance);
          };
          speakNext();
        });
      };

      try {
        const response = await fetch("/api/intake/voice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: message,
          }),
        });

        if (!response.ok) {
          await speakWithBrowserVoice();
          return;
        }
        if (interviewSpeechRequestIdRef.current !== requestId) return;

        const blob = await response.blob();
        if (interviewSpeechRequestIdRef.current !== requestId) return;

        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        audio.preload = "auto";
        interviewAudioRef.current = audio;
        interviewAudioObjectUrlRef.current = objectUrl;

        audio.onended = () => {
          if (interviewSpeechRequestIdRef.current !== requestId) return;
          stopInterviewerSpeech();
        };
        audio.onerror = () => {
          if (interviewSpeechRequestIdRef.current !== requestId) return;
          setVoiceError("Interviewer voice could not be played. You can continue by text.");
          stopInterviewerSpeech();
        };
        audio.load();
        await waitForAudioReady(audio, AUDIO_READY_TIMEOUT_MS);
        if (interviewSpeechRequestIdRef.current !== requestId) return;

        await new Promise((resolve) => window.setTimeout(resolve, AUDIO_PREROLL_DELAY_MS));
        if (interviewSpeechRequestIdRef.current !== requestId) return;

        audio.currentTime = 0;
        await audio.play();
        if (interviewSpeechRequestIdRef.current !== requestId) return;
        setAudioPlaying(true);
      } catch (err: any) {
        if (interviewSpeechRequestIdRef.current !== requestId) return;
        if (isIgnorablePlaybackError(err)) {
          stopInterviewerSpeech();
          return;
        }
        const fallbackUsed = await speakWithBrowserVoice();
        if (!fallbackUsed) {
          stopInterviewerSpeech();
        }
      }
    },
    [autoVoiceEnabled, stopInterviewerSpeech],
  );

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    async function verifySession() {
      const first = await supabase.auth.getSession();
      if (cancelled) return;
      let session = first.data.session;

      if (!session) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        const second = await supabase.auth.getSession();
        if (cancelled) return;
        session = second.data.session;
      }

      if (!session) {
        router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
        return;
      }

      try {
        const status = await fetchJson<{ completedOnboarding: boolean }>(
          "/api/user/onboarding-status",
          {
            cache: "no-store",
            timeoutMs: 8_000,
          },
        );
        if (!cancelled && status.completedOnboarding) {
          router.replace("/dashboard");
        }
      } catch { }
    }

    void verifySession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: unknown, session: unknown) => {
      const authEvent = typeof event === "string" ? event : "";
      if (authEvent === "SIGNED_OUT" || (authEvent === "INITIAL_SESSION" && !session)) {
        router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (bootstrapAttemptedRef.current) return;
    bootstrapAttemptedRef.current = true;

    let cancelled = false;
    async function bootstrap() {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;

        await fetchJson<{ success: boolean }>("/api/user/bootstrap", {
          method: "POST",
          timeoutMs: 8_000,
        });
      } catch { }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stepId !== "story") return;
    let cancelled = false;

    const loadInterviewerSprites = async () => {
      try {
        const result = await fetchJson<InterviewerSpriteListResponse>(
          "/api/intake/interviewer-sprites",
          {
            cache: "no-store",
            timeoutMs: 8_000,
          },
        );
        if (cancelled) return;

        const discoveredSprites = Array.isArray(result?.sprites)
          ? result.sprites.filter(
            (sprite): sprite is string =>
              typeof sprite === "string" && sprite.trim().length > 0,
          )
          : [];
        if (discoveredSprites.length === 0) return;
        setInterviewerSprites(discoveredSprites);
      } catch { }
    };

    void loadInterviewerSprites();
    return () => {
      cancelled = true;
    };
  }, [stepId]);

  useEffect(() => {
    if (stepId !== "story" || !interviewStarted) return;
    if (!latestAssistantMessage) return;
    if (lastSpokenAssistantIdRef.current === latestAssistantMessage.id) return;

    if (lastSpokenAssistantIdRef.current !== null) {
      cycleInterviewerSprite();
    }

    const stageEl = storyStageRef.current;
    const wandEl = wandAnchorRef.current;
    const targetEl = latestAssistantBubbleRef.current;
    if (stageEl && wandEl && targetEl) {
      const stageRect = stageEl.getBoundingClientRect();
      const wandRect = wandEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const startX = wandRect.left + wandRect.width / 2 - stageRect.left;
      const startY = wandRect.top + wandRect.height / 2 - stageRect.top;
      const endX = targetRect.left + Math.min(26, targetRect.width * 0.18) - stageRect.left;
      const endY = targetRect.top + 20 - stageRect.top;
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      setZapBeamStyle({
        left: `${Math.round(startX)}px`,
        top: `${Math.round(startY)}px`,
        width: `${Math.max(36, Math.round(length))}px`,
        transform: `rotate(${angle}deg)`,
      });
    } else {
      setZapBeamStyle(null);
    }

    if (summonZapTimeoutRef.current) {
      clearTimeout(summonZapTimeoutRef.current);
      summonZapTimeoutRef.current = null;
    }
    setSummonZapActive(true);
    summonZapTimeoutRef.current = setTimeout(() => {
      setSummonZapActive(false);
      summonZapTimeoutRef.current = null;
    }, 1500);

    lastSpokenAssistantIdRef.current = latestAssistantMessage.id;
    void speakInterviewerText(latestAssistantMessage.content);
  }, [
    cycleInterviewerSprite,
    interviewStarted,
    latestAssistantMessage,
    speakInterviewerText,
    stepId,
  ]);

  useEffect(
    () => () => {
      if (summonZapTimeoutRef.current) {
        clearTimeout(summonZapTimeoutRef.current);
        summonZapTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    setStepIndex((index) => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);



  const applyInterviewResponse = useCallback((
    response: InterviewApiResponse,
    draftMessages: OnboardingInterviewMessage[],
  ) => {
    const nextReflections = (response.reflections ?? []).slice(0, 12);
    setInterviewReflections(nextReflections);
    setCoverage(normalizeCoverage(response.coverage, nextReflections));

    if (response.nextPrompt?.question) {
      const assistantMessage: OnboardingInterviewMessage = {
        id: makeId("assistant"),
        role: "assistant",
        content: response.nextPrompt.question,
        createdAt: new Date().toISOString(),
        domainId: response.nextPrompt.domainId,
      };
      setInterviewMessages([...draftMessages, assistantMessage]);
    } else {
      setInterviewMessages(draftMessages);
    }
  }, []);

  const requestInterviewTurn = useCallback(async (
    messages: OnboardingInterviewMessage[],
  ) => {
    const token = await getAccessTokenOrNull();
    if (!token) {
      setError("Your session expired. Please sign in again.");
      router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
      return;
    }

    const requestId = interviewRequestIdRef.current + 1;
    interviewRequestIdRef.current = requestId;
    interviewRequestAbortRef.current?.abort();
    const controller = new AbortController();
    interviewRequestAbortRef.current = controller;

    const conversationLifeStory = lifeStoryFromMessages(messages);

    setInterviewLoading(true);
    setError(null);
    try {
      const result = await fetchJson<InterviewApiResponse>("/api/intake/interview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resumeText: onboardingResumeText || null,
          lifeStory: conversationLifeStory || lifeStory || null,
          simulationMode: simMode,
          messages,
          previousReflections: interviewReflections,
        }),
        signal: controller.signal,
      });
      if (interviewRequestIdRef.current !== requestId) return;
      applyInterviewResponse(result, messages);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      if (interviewRequestIdRef.current !== requestId) return;
      setError(err?.message ?? "Unable to continue interview.");
    } finally {
      if (interviewRequestIdRef.current === requestId) {
        setInterviewLoading(false);
      }
    }
  }, [
    applyInterviewResponse,
    interviewReflections,
    lifeStory,
    onboardingResumeText,
    router,
    simMode,
  ]);

  useEffect(() => {
    if (stepId !== "story" || !interviewStarted) return;
    if (interviewMessages.length > 0) return;
    void requestInterviewTurn([]);
  }, [interviewMessages.length, interviewStarted, requestInterviewTurn, stepId]);

  useEffect(() => {
    if (interviewMessages.length === 0) return;
    setInterviewStarted(true);
  }, [interviewMessages.length]);

  useEffect(() => {
    if (stepId !== "story") return;
    const container = storyScrollRef.current;
    if (!container) return;
    const rafId = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [interviewLoading, interviewMessages.length, stepId]);

  useEffect(() => {
    if (!interviewLoading) return;
    if (activeVoiceTarget === "story") {
      setActiveVoiceTarget(null);
    }
  }, [activeVoiceTarget, interviewLoading]);

  useEffect(() => {
    if (stepId === "story") return;
    cancelInterviewerSpeech();
    setActiveVoiceTarget(null);
  }, [cancelInterviewerSpeech, stepId]);

  useEffect(() => {
    if (autoVoiceEnabled) return;
    cancelInterviewerSpeech();
  }, [autoVoiceEnabled, cancelInterviewerSpeech]);

  useEffect(
    () => () => {
      interviewRequestAbortRef.current?.abort();
      interviewRequestAbortRef.current = null;
      cancelInterviewerSpeech();
    },
    [cancelInterviewerSpeech],
  );

  function toggleVoice(target: SpeechTarget) {
    setVoiceError(null);
    setActiveVoiceTarget((previous) => (previous === target ? null : target));
  }

  function startInterview() {
    if (interviewStarted) return;
    setVoiceError(null);
    setError(null);
    setInterviewStarted(true);
  }

  async function handleResumeUpload(file: File) {
    if (!file) return;
    setError(null);
    setUploadingResume(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await fetchJson<ResumeUploadResponse>("/api/intake/resume", {
        method: "POST",
        body: form,
      });
      setResumeText(result.text);
      setResumeMeta(result.meta);
    } catch (err: any) {
      setError(err?.message ?? "Could not parse resume.");
    } finally {
      setUploadingResume(false);
    }
  }

  async function submitStoryAnswer(rawInput?: string) {
    if (!interviewStarted || !hasAssistantQuestion) return;
    const trimmed = (rawInput ?? storyInput).trim();
    if (!trimmed || interviewLoading) return;
    setStoryInput("");

    const lastAssistant = [...interviewMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    const draftMessages = [
      ...interviewMessages,
      {
        id: makeId("user"),
        role: "user" as const,
        content: trimmed,
        createdAt: new Date().toISOString(),
        ...(isInterviewMessageDomainId(lastAssistant?.domainId)
          ? { domainId: lastAssistant.domainId }
          : { domainId: "decision_archaeology" as const }),
      },
    ];
    setInterviewMessages(draftMessages);
    setLifeStory((previous) => withTranscript(previous, trimmed));
    await requestInterviewTurn(draftMessages);
  }

  function goToSimulationStep() {
    if (onboardingPath === "minimal" && !hasResumeSignal) {
      setError("Upload a resume or answer the required questions first.");
      return;
    }
    const simulationStepIndex = steps.indexOf("simulation");
    if (simulationStepIndex < 0) return;
    setStepIndex(simulationStepIndex);
    setError(null);
  }

  function chooseOnboardingPath(path: OnboardingPath) {
    setOnboardingPath(path);
    setError(null);
  }

  function selectSimulationMode(mode: SimulationMode) {
    setSimMode(mode);
    setSimHorizonPreset(SIMULATION_MODE_DETAILS[mode].horizonPreset);
  }

  async function finalizeOnboarding() {
    setSaving(true);
    setError(null);
    try {
      const result = await fetchJson<{
        setup: UserSetup;
        notes?: string[];
        meta?: any;
      }>("/api/intake/career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: [
            onboardingResumeText,
            lifeStory,
            hasManualSignal ? `Supplemental Memory Data:\n- Career: ${career}\n- Kids: ${kids}\n- Sleep: ${sleep}\n- Risk: ${risk}\n- Personality: ${social}${extraNotes ? `\n- Extra: ${extraNotes}` : ""}` : ""
          ].filter(Boolean).join("\n\n"),
          onboarding: {
            avatar,
            resumeText: onboardingResumeText || null,
            lifeStory: [
              lifeStory,
              hasManualSignal ? `Supplemental Memory Data:\n- Career: ${career}\n- Kids: ${kids}\n- Sleep: ${sleep}\n- Risk: ${risk}\n- Personality: ${social}${extraNotes ? `\n- Extra: ${extraNotes}` : ""}` : ""
            ].filter(Boolean).join("\n\n") || null,
            interviewMessages,
            reflections: interviewReflections,
            simulationMode: simMode,
            simulationHorizonPreset: simHorizonPreset,
          },
        }),
        timeoutMs: 120_000,
      });

      clearEvents();
      clearScenarios();
      saveSetup(result.setup);
      await syncLocalSimulationStateToSupabase();
      globalThis?.sessionStorage?.setItem(ONBOARDING_BOOTSTRAP_KEY, "1");
      globalThis?.sessionStorage?.setItem(ONBOARDING_DASHBOARD_TRANSITION_KEY, "1");
      router.push(nextPath);
    } catch (err: any) {
      setError(err?.message ?? "Unable to save onboarding.");
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    if (stepIndex >= steps.length - 1) return;
    if (!canAdvanceCurrentStep) return;
    setError(null);
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  const spriteParts = useMemo(
    () => parseSpriteParts(avatar.spriteId),
    [avatar.spriteId],
  );

  // Redundant local sprite state helpers removed

  // Unused sprite tab classes removed
  const onboardingStepPanelClass =
    "arcane-panel arcane-panel-outline-fat rounded-2xl p-5 sm:p-6";
  const onboardingContentMaxWidthClass =
    stepId === "story" ? "max-w-[84rem]" : isWideStep ? "max-w-6xl" : "max-w-3xl";
  const storyBubbleAssistantClass =
    "max-w-[88%] rounded-[18px] rounded-bl-[8px] border border-zinc-700/80 bg-zinc-800/90 px-4 py-3 text-[0.92rem] leading-relaxed text-zinc-100";
  const storyBubbleUserClass =
    "max-w-[88%] rounded-[18px] rounded-br-[8px] border border-zinc-600/80 bg-zinc-700/95 px-4 py-3 text-[0.92rem] leading-relaxed text-zinc-100";
  const insightsPanel = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/15 bg-zinc-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-100">Simulation accuracy</p>
          <p className="text-sm text-zinc-300">{simulationAccuracy}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-zinc-100 transition-[width] duration-300"
            style={{ width: `${simulationAccuracy}%` }}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          You can continue to simulations at any point. Sharing more details improves accuracy.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/15 bg-zinc-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Focus areas
          </p>
          <p className="text-[11px] text-zinc-400">
            {coveredDomainCount} of {INTERVIEW_DOMAINS.length}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          Coverage updates as your interview responses grow.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {interviewQuestionCatalog.map((item) => {
            const domainCoverage = coverage[item.domainId] ?? 0;
            return (
              <div
                key={item.domainId}
                className="rounded-xl border border-white/10 bg-zinc-950/70 p-2.5"
              >
                <p className="text-xs font-semibold text-zinc-200">{item.label}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-zinc-200 transition-[width] duration-300"
                    style={{ width: `${Math.max(4, Math.round(domainCoverage))}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {Math.round(domainCoverage)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`mystic-bg min-h-[100svh] text-zinc-100 ${stepId === "story" ? "h-[100svh] overflow-hidden" : ""
        }`}
      style={ONBOARDING_OUTLINE_VARS}
    >
      <div className="relative z-10 w-full px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative flex min-h-[5.2rem] items-start sm:min-h-[6.1rem]">
          <div className="pointer-events-none absolute left-1/2 top-1/2 w-[min(82vw,31rem)] sm:w-[min(76vw,33rem)] -translate-x-1/2 -translate-y-1/2">
            <OnboardingSpriteProgress progress={onboardingProgress} />
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 mx-auto flex w-full flex-col px-4 pt-4 sm:px-6 ${onboardingContentMaxWidthClass
          } ${stepId === "story"
            ? "h-[calc(100svh-7rem)] overflow-hidden pb-4"
            : "min-h-[calc(100svh-7rem)] pb-6"
          }`}
      >
        <header className={`text-center ${stepId === "story" ? "shrink-0" : ""}`}>
          <h1 className="arcane-display-title text-3xl leading-tight text-zinc-50 sm:text-4xl">
            {step.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">{step.subtitle}</p>
        </header>

        <section
          className={`flex-1 min-h-0 ${isPathStep ? "mt-6 flex items-start" : stepId === "story" ? "mt-6 overflow-hidden" : "mt-10"}`}
        >
          <div
            className={`mx-auto w-full ${onboardingContentMaxWidthClass} ${stepId === "story" ? "h-full min-h-0 overflow-hidden" : ""
              }`}
          >
            {stepId === "avatar" ? (
              <div className={onboardingStepPanelClass}>
                <AvatarCustomizer
                  avatar={avatar}
                  onChange={(nextAvatar) => {
                    setAvatar(nextAvatar);
                  }}
                />
              </div>
            ) : null}

            {stepId === "path" ? (
              <div className="mx-auto w-full max-w-6xl py-1 sm:py-2">
                <div className="grid gap-7 md:grid-cols-2 md:gap-12">
                  <button
                    type="button"
                    onClick={() => chooseOnboardingPath("minimal")}
                    className={`arcane-panel onboarding-path-card group relative flex min-h-[18rem] flex-col overflow-hidden rounded-3xl border p-6 text-left transition-all duration-200 md:min-h-[20rem] md:p-7 ${onboardingPath === "minimal"
                      ? "arcane-panel-outline-fat scale-[1.01] border-amber-200/70 bg-[linear-gradient(180deg,rgba(40,34,18,0.95),rgba(14,16,24,0.97))] shadow-[0_0_0_2px_rgba(245,208,124,0.55),0_0_34px_rgba(245,208,124,0.26),0_18px_36px_rgba(0,0,0,0.45)]"
                      : "arcane-panel-outline-thin border-white/10 bg-[linear-gradient(180deg,rgba(9,15,28,0.9),rgba(7,12,23,0.94))] opacity-[0.8] saturate-75 hover:border-zinc-300/40 hover:opacity-100 hover:saturate-100"
                      }`}
                    aria-pressed={onboardingPath === "minimal"}
                  >
                    {onboardingPath === "minimal" ? (
                      <span className="absolute right-3 top-3 rounded-full border border-amber-200/70 bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-950 shadow-[0_0_14px_rgba(245,208,124,0.55)]">
                        Selected
                      </span>
                    ) : null}
                    <p
                      className={`arcane-kicker text-[10px] ${onboardingPath === "minimal" ? "text-amber-200" : "text-zinc-400"
                        }`}
                    >
                      Fast Setup
                    </p>
                    <p
                      className={`arcane-display-title mt-1 text-2xl font-semibold leading-tight md:text-[1.75rem] ${onboardingPath === "minimal" ? "text-amber-50" : "text-zinc-100"
                        }`}
                    >
                      Minimal Path
                    </p>
                    <ul
                      className={`mt-3 max-w-[36ch] list-disc space-y-1.5 pl-5 pr-14 text-[0.93rem] leading-relaxed ${onboardingPath === "minimal" ? "text-zinc-100" : "text-zinc-300"
                        }`}
                    >
                      <li>Upload your resume or answer a few questions.</li>
                      <li>Add a short text description about yourself.</li>
                      <li>Choose simulation settings and continue.</li>
                    </ul>
                    <p className="mt-auto pt-5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      1-2 minutes
                    </p>
                    <Image
                      src="/decors/assets/ornate_chest_tiny.png"
                      alt=""
                      width={138}
                      height={66}
                      aria-hidden
                      className="pointer-events-none absolute bottom-2 right-3 opacity-80"
                      style={{ width: "auto", height: "auto" }}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => chooseOnboardingPath("guided")}
                    className={`arcane-panel onboarding-path-card group relative flex min-h-[18rem] flex-col overflow-hidden rounded-3xl border p-6 text-left transition-all duration-200 md:min-h-[20rem] md:p-7 ${onboardingPath === "guided"
                      ? "arcane-panel-outline-fat scale-[1.01] border-amber-200/70 bg-[linear-gradient(180deg,rgba(40,34,18,0.95),rgba(14,16,24,0.97))] shadow-[0_0_0_2px_rgba(245,208,124,0.55),0_0_34px_rgba(245,208,124,0.26),0_18px_36px_rgba(0,0,0,0.45)]"
                      : "arcane-panel-outline-thin border-white/10 bg-[linear-gradient(180deg,rgba(9,15,28,0.9),rgba(7,12,23,0.94))] opacity-[0.8] saturate-75 hover:border-zinc-300/40 hover:opacity-100 hover:saturate-100"
                      }`}
                    aria-pressed={onboardingPath === "guided"}
                  >
                    {onboardingPath === "guided" ? (
                      <span className="absolute right-3 top-3 rounded-full border border-amber-200/70 bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-950 shadow-[0_0_14px_rgba(245,208,124,0.55)]">
                        Selected
                      </span>
                    ) : null}
                    <p
                      className={`arcane-kicker text-[10px] ${onboardingPath === "guided" ? "text-amber-200" : "text-zinc-400"
                        }`}
                    >
                      Guided Setup
                    </p>
                    <p
                      className={`arcane-display-title mt-1 text-2xl font-semibold leading-tight md:text-[1.75rem] ${onboardingPath === "guided" ? "text-amber-50" : "text-zinc-100"
                        }`}
                    >
                      Detailed Path
                    </p>
                    <ul
                      className={`mt-3 max-w-[37ch] list-disc space-y-1.5 pl-5 pr-14 text-[0.93rem] leading-relaxed ${onboardingPath === "guided" ? "text-zinc-100" : "text-zinc-300"
                        }`}
                    >
                      <li>Interview-style flow with adaptive follow-up questions.</li>
                      <li>Covers different parts of your life and goals.</li>
                      <li>Improves simulation accuracy and personalization.</li>
                    </ul>
                    <p className="mt-auto pt-5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      3-7 minutes
                    </p>
                    <Image
                      src="/decors/assets/luna_orb_tiny.png"
                      alt=""
                      width={84}
                      height={84}
                      aria-hidden
                      className="pointer-events-none absolute bottom-2 right-4 opacity-85"
                      style={{ width: "auto", height: "auto" }}
                    />
                  </button>
                </div>
              </div>
            ) : null}

            {stepId === "resume" ? (
              <div className={onboardingStepPanelClass}>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
                  <div className="p-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-zinc-200">Upload resume</p>
                      {uploadingResume ? (
                        <span className="text-xs text-zinc-400">Parsing...</span>
                      ) : null}
                    </div>
                    <label className="mt-3 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl bg-zinc-800/60 px-4 text-center transition hover:bg-zinc-800/80">
                      <Upload className="h-5 w-5 text-zinc-300" />
                      <p className="mt-2 text-sm text-zinc-200">PDF, DOCX, or TXT</p>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void handleResumeUpload(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {resumeMeta ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        Uploaded: {resumeMeta.fileName}
                      </p>
                    ) : null}
                  </div>

                  <div className="hidden items-center justify-center md:flex">
                    <div className="flex h-full min-h-[180px] items-center">
                      <div className="relative flex h-full items-center px-2">
                        <div className="h-full w-px bg-zinc-700/80" />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900 px-2 text-xs text-zinc-500">
                          or
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="md:hidden">
                    <div className="relative my-1 h-px bg-zinc-700/80">
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900 px-2 text-xs text-zinc-500">
                        or
                      </span>
                    </div>
                  </div>

                  <div className="p-1">
                    <p className="text-sm text-zinc-200">Answer a few questions</p>
                    <div className="mt-3 space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      <div className="space-y-1.5">
                        <Label htmlFor="career" className="text-zinc-300 text-xs">1. What career path or job do you want?</Label>
                        <Input id="career" value={career} onChange={e => setCareer(e.target.value)} placeholder="e.g. Software Engineer, Biologist, Nurse, etc." className="w-full rounded-lg border-0 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0 h-9" />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="kids" className="text-zinc-300 text-xs">2. Do you want to have kids?</Label>
                        <Input id="kids" value={kids} onChange={e => setKids(e.target.value)} placeholder="e.g. Yes, 2 kids in my 30s. Or: No, never." className="w-full rounded-lg border-0 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0 h-9" />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="sleep" className="text-zinc-300 text-xs">3. Average hours of sleep you get</Label>
                        <Input id="sleep" type="number" value={sleep} onChange={e => setSleep(e.target.value)} placeholder="e.g. 7" className="w-full rounded-lg border-0 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0 h-9" />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-zinc-300 text-xs">4. Risk Tolerance</Label>
                        <RadioGroup value={risk} onValueChange={setRisk} className="flex gap-4">
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="low" id="r1" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="r1" className="text-zinc-400 text-xs cursor-pointer">Play it safe</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="medium" id="r2" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="r2" className="text-zinc-400 text-xs cursor-pointer">Calculated</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="high" id="r3" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="r3" className="text-zinc-400 text-xs cursor-pointer">Very risky</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2 pb-1">
                        <Label className="text-zinc-300 text-xs">5. Personality</Label>
                        <RadioGroup value={social} onValueChange={setSocial} className="flex gap-4">
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="introvert" id="s1" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="s1" className="text-zinc-400 text-xs cursor-pointer">Introvert</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="ambivert" id="s2" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="s2" className="text-zinc-400 text-xs cursor-pointer">Ambivert</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <RadioGroupItem value="extrovert" id="s3" className="border-zinc-500 text-amber-200 data-[state=checked]:border-amber-200" />
                            <Label htmlFor="s3" className="text-zinc-400 text-xs cursor-pointer">Extrovert</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-1.5 pb-2">
                        <Label htmlFor="extraNotes" className="text-zinc-300 text-xs">Extra notes (optional)</Label>
                        <Textarea id="extraNotes" value={extraNotes} onChange={e => setExtraNotes(e.target.value)} placeholder="Any additional details you want the Oracle to know..." className="w-full rounded-lg border-0 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[60px] resize-none text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {stepId === "story" ? (
              <div className="flex h-full min-h-0 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Sheet open={insightsOpen} onOpenChange={setInsightsOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        className="arcane-button-secondary h-9 rounded-md px-3 text-xs"
                      >
                        <PanelRight className="h-4 w-4" />
                        Insights
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      className="w-[min(94vw,450px)] border-white/15 bg-zinc-950 p-5 text-zinc-100"
                    >
                      <SheetHeader>
                        <SheetTitle className="text-left text-zinc-100">
                          Interview insights
                        </SheetTitle>
                        <SheetDescription className="text-left text-zinc-400">
                          Simulation accuracy and focus-area coverage.
                        </SheetDescription>
                      </SheetHeader>
                      <div className="mt-5">{insightsPanel}</div>
                    </SheetContent>
                  </Sheet>

                  <Button
                    type="button"
                    onClick={() => {
                      setVoiceError(null);
                      setAutoVoiceEnabled((previous) => {
                        const nextEnabled = !previous;
                        if (!nextEnabled) {
                          cancelInterviewerSpeech();
                        }
                        return nextEnabled;
                      });
                    }}
                    className="arcane-button-secondary h-9 rounded-md px-3 text-xs"
                  >
                    {autoVoiceEnabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                    {audioPlaying ? "Speaking..." : autoVoiceEnabled ? "Voice on" : "Voice off"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!latestAssistantMessage?.content) return;
                      setVoiceError(null);
                      void speakInterviewerText(latestAssistantMessage.content, {
                        force: true,
                      });
                    }}
                    disabled={!latestAssistantMessage?.content}
                    className="arcane-button-secondary h-9 rounded-md px-3 text-xs disabled:opacity-40"
                  >
                    Replay
                  </Button>
                </div>

                <div
                  ref={storyStageRef}
                  className="relative grid min-h-0 flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
                >
                  {summonZapActive && zapBeamStyle ? (
                    <div
                      aria-hidden
                      className="interview-zap-beam hidden lg:block"
                      style={zapBeamStyle}
                    />
                  ) : null}

                  <div className="relative hidden min-h-0 items-center justify-center px-4 pb-2 pt-4 lg:flex">
                    <Image
                      src={currentInterviewerSprite}
                      alt="AI interviewer sprite"
                      width={960}
                      height={1200}
                      priority={stepId === "story"}
                      className={`h-auto max-h-[min(76svh,760px)] w-auto max-w-full object-contain object-top drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)] transition-transform duration-500 ${audioPlaying ? "scale-[1.01]" : "scale-100"
                        }`}
                      sizes="(max-width: 1024px) 94vw, 62vw"
                    />
                    {summonZapActive ? (
                      <div aria-hidden className="interviewer-wand-flash">
                        <span className="interviewer-wand-spark" />
                      </div>
                    ) : null}
                    <span aria-hidden ref={wandAnchorRef} className="interviewer-wand-anchor" />
                  </div>

                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="rounded-xl border border-cyan-200/40 bg-zinc-900/85 px-4 py-3 text-sm leading-relaxed text-cyan-100 shadow-[0_12px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                      You can end the interview anytime when you think you answered enough
                      questions so you can start the actual simulation!
                    </div>
                    <div className="flex h-full min-h-0 flex-col rounded-[24px] bg-zinc-900/55 p-3 sm:p-4">
                      <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">Interview</p>
                          <p className="text-xs text-zinc-400">
                            Type or use the mic. Scroll to review full conversation.
                          </p>
                        </div>
                      </div>

                      {interviewStarted ? (
                        <div
                          ref={storyScrollRef}
                          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-2 scroll-smooth"
                        >
                          <div className="space-y-3 pb-2">
                            {interviewMessages.map((message) => {
                              const isAssistant = message.role === "assistant";
                              const isLatestAssistant =
                                isAssistant && message.id === latestAssistantMessage?.id;
                              return isAssistant ? (
                                <div
                                  key={message.id}
                                  className="flex justify-start gap-1.5 pr-8 sm:pr-14"
                                >
                                  <div className="mb-0.5 shrink-0 self-end rounded-full border border-cyan-300/40 bg-zinc-800 p-0.5 sm:hidden">
                                    <Image
                                      src={currentInterviewerSprite}
                                      alt=""
                                      width={26}
                                      height={26}
                                      aria-hidden
                                      className="h-[26px] w-[26px] rounded-full object-cover object-top"
                                    />
                                  </div>
                                  <p
                                    ref={isLatestAssistant ? latestAssistantBubbleRef : null}
                                    className={`${storyBubbleAssistantClass} ${summonZapActive && isLatestAssistant
                                      ? "interview-summoned-question"
                                      : ""
                                      }`}
                                  >
                                    {message.content}
                                  </p>
                                </div>
                              ) : (
                                <div
                                  key={message.id}
                                  className="flex w-full justify-end gap-1.5 pl-8 sm:gap-2 sm:pl-12"
                                >
                                  <div className={storyBubbleUserClass}>{message.content}</div>
                                  <div className="mb-0.5 shrink-0 self-end rounded-full border border-zinc-500/60 bg-zinc-800 p-0.5">
                                    <PixelAvatar avatar={avatar} size={26} />
                                  </div>
                                </div>
                              );
                            })}
                            {interviewLoading ? (
                              <Loader
                                variant="loading-dots"
                                size="sm"
                                text="Thinking"
                                className="text-xs text-zinc-400"
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-1 items-center justify-center">
                          <button
                            type="button"
                            onClick={startInterview}
                            className="group inline-flex h-36 w-36 items-center justify-center rounded-full border border-white/20 bg-zinc-900/85 text-zinc-100 shadow-[0_20px_34px_rgba(0,0,0,0.35)] transition hover:scale-[1.02] hover:bg-zinc-900"
                            aria-label="Start interview"
                          >
                            <span className="sr-only">Start interview</span>
                            <Play className="h-14 w-14 translate-x-0.5 fill-current" />
                          </button>
                        </div>
                      )}

                      <AIInputWithLoading
                        id="onboarding-story-input"
                        value={storyInput}
                        onValueChange={setStoryInput}
                        placeholder={
                          interviewStarted
                            ? hasAssistantQuestion
                              ? "Type your answer or use the mic for transcription."
                              : "Interviewer is preparing the first question..."
                            : "Press play to start the interview."
                        }
                        minHeight={108}
                        maxHeight={240}
                        loadingDuration={900}
                        onSubmit={submitStoryAnswer}
                        submitting={interviewLoading}
                        disabled={!interviewStarted || !hasAssistantQuestion || interviewLoading}
                        inlineAction={
                          <AIVoiceInput
                            active={activeVoiceTarget === "story"}
                            onActiveChange={(nextActive) => {
                              const isActive = activeVoiceTarget === "story";
                              if (nextActive !== isActive) {
                                toggleVoice("story");
                              }
                            }}
                            onTranscript={(text) => {
                              setStoryInput((previous) => withTranscript(previous, text));
                            }}
                            onError={setVoiceError}
                            variant="compact"
                            visualizerBars={14}
                            className="py-0"
                            disabled={!interviewStarted || !hasAssistantQuestion || interviewLoading}
                          />
                        }
                        submittedText="Thinking..."
                        showStatusText={false}
                        className="w-full max-w-none shrink-0 py-0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {stepId === "simulation" ? (
              <div className="mx-auto w-full max-w-6xl">
                <div>
                  <div className="mt-6 grid gap-7 md:grid-cols-2 md:gap-12">
                    {SIMULATION_MODE_OPTIONS.map((option) => {
                      const details = SIMULATION_MODE_DETAILS[option.id];
                      const selected = simMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => selectSimulationMode(option.id)}
                          className={`arcane-panel onboarding-path-card group relative flex min-h-[19rem] flex-col overflow-hidden rounded-3xl border p-6 text-left transition-all duration-200 md:min-h-[21rem] md:p-7 ${selected
                            ? "arcane-panel-outline-fat scale-[1.01] border-amber-200/70 bg-[linear-gradient(180deg,rgba(40,34,18,0.95),rgba(14,16,24,0.97))] shadow-[0_0_0_2px_rgba(245,208,124,0.55),0_0_34px_rgba(245,208,124,0.26),0_18px_36px_rgba(0,0,0,0.45)]"
                            : "arcane-panel-outline-thin border-white/10 bg-[linear-gradient(180deg,rgba(9,15,28,0.9),rgba(7,12,23,0.94))] opacity-[0.8] saturate-75 hover:border-zinc-300/40 hover:opacity-100 hover:saturate-100"
                            }`}
                          aria-pressed={selected}
                        >
                          {selected ? (
                            <span className="absolute right-3 top-3 rounded-full border border-amber-200/70 bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-950 shadow-[0_0_14px_rgba(245,208,124,0.55)]">
                              Selected
                            </span>
                          ) : null}
                          <p
                            className={`arcane-kicker text-[10px] ${selected ? "text-amber-200" : "text-zinc-400"
                              }`}
                          >
                            {details.kicker}
                          </p>
                          <p
                            className={`arcane-display-title mt-1 text-2xl font-semibold leading-tight md:text-[1.75rem] ${selected ? "text-amber-50" : "text-zinc-100"
                              }`}
                          >
                            {option.label}
                          </p>
                          <ul
                            className={`mt-3 max-w-[38ch] list-disc space-y-1.5 pl-5 pr-6 text-[0.93rem] leading-relaxed ${selected ? "text-zinc-100" : "text-zinc-300"
                              }`}
                          >
                            {details.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void finalizeOnboarding()}
                      disabled={saving}
                      className="arcane-button-primary h-10 rounded-md px-6 text-sm font-medium normal-case tracking-normal disabled:opacity-40"
                    >
                      {saving ? "Building simulation..." : "Start simulating"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {voiceError ? (
          <div className="mt-4 rounded-md border border-white/20 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            {voiceError}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-md border border-white/20 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            {error}
          </div>
        ) : null}

        <footer className="mt-auto pt-5 flex items-center justify-between gap-3">
          <div className="flex items-center">
            {stepId !== "avatar" ? (
              <Button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0 || saving}
                className="arcane-button-primary h-10 min-w-[170px] rounded-md px-6 text-sm font-medium normal-case tracking-normal disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : null}
          </div>
          <div
            className={`flex items-center gap-2 ${stepId === "avatar" ? "justify-end sm:min-w-[340px]" : ""
              }`}
          >
            {stepId === "avatar" ? (
              <Button
                onClick={goNext}
                disabled={!canAdvanceCurrentStep || saving}
                className="arcane-button-primary h-10 min-w-[170px] rounded-md px-6 text-sm font-medium normal-case tracking-normal"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}

            {stepId === "path" ? (
              <Button
                type="button"
                onClick={goNext}
                disabled={!canAdvanceCurrentStep || saving}
                className="arcane-button-primary h-10 min-w-[220px] rounded-md px-6 text-sm font-medium normal-case tracking-normal disabled:opacity-40"
              >
                Continue with {onboardingPath === "guided" ? "Detailed Path" : "Minimal Path"}
              </Button>
            ) : null}

            {stepId === "resume" ? (
              <Button
                type="button"
                onClick={goToSimulationStep}
                disabled={!hasResumeSignal || saving}
                className="arcane-button-primary h-10 rounded-md px-6 text-sm font-medium normal-case tracking-normal disabled:opacity-40"
              >
                Start simulation
              </Button>
            ) : null}

            {stepId === "story" ? (
              <Button
                type="button"
                onClick={goToSimulationStep}
                disabled={saving}
                className="arcane-button-primary h-10 rounded-md px-6 text-sm font-medium normal-case tracking-normal disabled:opacity-40"
              >
                Start simulation
              </Button>
            ) : null}
          </div>
        </footer>
      </div>

    </div>
  );
}
