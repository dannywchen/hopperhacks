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
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { AIVoiceInput } from "@/components/ui/ai-voice-input";
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
  SIMULATION_HORIZON_OPTIONS,
  SIMULATION_INTENT_OPTIONS,
} from "@/lib/onboarding/config";
import type {
  OnboardingAvatar,
  OnboardingDomainReflection,
  OnboardingInterviewDomainId,
  OnboardingInterviewMessage,
  OnboardingLinkedinProfile,
  SimulationHorizonPreset,
  SimulationIntent,
  UserSetup,
} from "@/lib/types";

const ONBOARDING_BOOTSTRAP_KEY = "deep-sim.onboarding-bootstrap.v1";

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
    title: "Add Personal Details",
    subtitle: "Upload your resume or import LinkedIn to quickly personalize your simulation.",
  },
  story: {
    title: "Guided Interview",
    subtitle: "Chat with the oracle to add richer life context before simulation.",
  },
  simulation: {
    title: "Start your simulation",
    subtitle: "Finalize your simulation settings before entering your dashboard.",
  },
};

const RESUME_MIN_CHARS = 120;

type OnboardingPath = "minimal" | "guided";

type SpriteHeadTone =
  | "porcelain"
  | "fair"
  | "beige"
  | "warm"
  | "tan"
  | "brown"
  | "deep";
type SpriteHairStyle =
  | "short-umber"
  | "short-blonde"
  | "short-brown"
  | "short-charcoal"
  | "short-black"
  | "ponytail-violet"
  | "ponytail-blonde"
  | "ponytail-platinum";
type SpriteOutfitStyle =
  | "green-tunic"
  | "blue-vest"
  | "blue-guard"
  | "red-vest"
  | "violet-vest"
  | "brown-leather"
  | "tan-traveler";

type SpriteParts = {
  head: SpriteHeadTone;
  hair: SpriteHairStyle;
  outfit: SpriteOutfitStyle;
};

type AvatarTab = "hair" | "clothes" | "head";

const AVATAR_TABS: Array<{
  id: AvatarTab;
  label: string;
}> = [
  { id: "hair", label: "Hair" },
  { id: "clothes", label: "Clothes" },
  { id: "head", label: "Skin" },
];

const HEAD_TONE_OPTIONS: Array<{ id: SpriteHeadTone; label: string }> = [
  { id: "beige", label: "Beige" },
  { id: "tan", label: "Tan" },
  { id: "brown", label: "Brown" },
  { id: "deep", label: "Deep" },
];

const HAIR_STYLE_OPTIONS: Array<{ id: SpriteHairStyle; label: string }> = [
  { id: "short-umber", label: "Umber" },
  { id: "short-blonde", label: "Blonde" },
  { id: "short-brown", label: "Brown" },
  { id: "short-charcoal", label: "Charcoal" },
  { id: "short-black", label: "Black" },
  { id: "ponytail-violet", label: "Violet" },
  { id: "ponytail-blonde", label: "Blonde" },
  { id: "ponytail-platinum", label: "Platinum" },
];

const OUTFIT_STYLE_OPTIONS: Array<{ id: SpriteOutfitStyle; label: string }> = [
  { id: "green-tunic", label: "Green" },
  { id: "blue-vest", label: "Blue" },
  { id: "blue-guard", label: "Dark Blue" },
  { id: "red-vest", label: "Red" },
  { id: "violet-vest", label: "Violet" },
  { id: "brown-leather", label: "Brown" },
  { id: "tan-traveler", label: "Tan" },
];

const DEFAULT_SPRITE_PARTS: SpriteParts = {
  head: "beige",
  hair: "short-brown",
  outfit: "blue-guard",
};

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
    const headers = new Headers(requestOptions.headers ?? undefined);
    if (withAuth) {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token && !headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${session.access_token}`);
        }
      } catch {}
    }

    const response = await fetch(url, {
      ...requestOptions,
      headers,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const jsonPayload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      const message =
        jsonPayload &&
        typeof jsonPayload === "object" &&
        ("error" in jsonPayload || "message" in jsonPayload)
          ? ((jsonPayload as { error?: string; message?: string }).error ??
            (jsonPayload as { error?: string; message?: string }).message ??
            `Request failed: ${response.status}`)
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

function isInterviewMessageDomainId(
  value: string | undefined,
): value is OnboardingInterviewDomainId {
  return Boolean(
    value && INTERVIEW_DOMAINS.some((domain) => domain.id === value),
  );
}

type PixelSpriteVariant = "front" | "side";

function normalizeSpriteOption<T extends string>(
  options: Array<{ id: T }>,
  value: string | undefined,
  fallback: T,
) {
  return options.some((option) => option.id === value) ? (value as T) : fallback;
}

function accessoryFromHairStyle(hair: SpriteHairStyle): OnboardingAvatar["accessory"] {
  if (hair.startsWith("ponytail-")) return "headphones";
  return "none";
}

function parseSpriteParts(spriteId: string): SpriteParts {
  const raw = String(spriteId || "").trim();
  const values: Record<string, string> = {};
  for (const segment of raw.split("|").slice(1)) {
    const [key, ...rest] = segment.split(":");
    if (!key || rest.length === 0) continue;
    values[key] = rest.join(":");
  }

  if (raw.startsWith("v3|")) {
    return {
      head: normalizeSpriteOption(HEAD_TONE_OPTIONS, values.head, DEFAULT_SPRITE_PARTS.head),
      hair: normalizeSpriteOption(HAIR_STYLE_OPTIONS, values.hair, DEFAULT_SPRITE_PARTS.hair),
      outfit: normalizeSpriteOption(
        OUTFIT_STYLE_OPTIONS,
        values.outfit,
        DEFAULT_SPRITE_PARTS.outfit,
      ),
    };
  }

  if (!raw.startsWith("v2|")) {
    const [legacyBase, legacyHead] = raw.split(":");
    const legacyHeadMap: Record<string, SpriteHeadTone> = {
      head_round: "beige",
      head_square: "tan",
      head_blob: "beige",
      head_flat: "brown",
    };
    return {
      ...DEFAULT_SPRITE_PARTS,
      head: legacyHeadMap[legacyHead] ?? DEFAULT_SPRITE_PARTS.head,
      hair: legacyBase === "base_tall" ? "ponytail-platinum" : DEFAULT_SPRITE_PARTS.hair,
    };
  }

  const legacyHeadMap: Record<string, SpriteHeadTone> = {
    round: "beige",
    "soft-square": "tan",
    oval: "tan",
    angular: "brown",
    blob: "beige",
  };
  const legacyHairMap: Record<string, SpriteHairStyle> = {
    buzz: "short-charcoal",
    short: "short-umber",
    "side-part": "short-brown",
    swept: "short-charcoal",
    pixie: "short-blonde",
    bob: "ponytail-blonde",
    wavy: "short-blonde",
    curly: "short-black",
    ponytail: "ponytail-violet",
    "twin-buns": "ponytail-platinum",
    "long-straight": "ponytail-blonde",
    braid: "ponytail-platinum",
    mohawk: "short-black",
    spiky: "short-charcoal",
    afro: "short-black",
    dreads: "short-brown",
  };
  const legacyOutfitMap: Record<string, SpriteOutfitStyle> = {
    tee: "green-tunic",
    hoodie: "blue-guard",
    jacket: "brown-leather",
    vest: "blue-vest",
    armor: "red-vest",
    kimono: "violet-vest",
    coat: "tan-traveler",
    sweater: "blue-guard",
  };

  return {
    head: normalizeSpriteOption(
      HEAD_TONE_OPTIONS,
      legacyHeadMap[values.head ?? ""] ?? values.head,
      DEFAULT_SPRITE_PARTS.head,
    ),
    hair: normalizeSpriteOption(
      HAIR_STYLE_OPTIONS,
      legacyHairMap[values.hair ?? ""] ?? values.hair,
      DEFAULT_SPRITE_PARTS.hair,
    ),
    outfit: normalizeSpriteOption(
      OUTFIT_STYLE_OPTIONS,
      legacyOutfitMap[values.top ?? ""] ?? values.outfit,
      DEFAULT_SPRITE_PARTS.outfit,
    ),
  };
}

function buildSpriteId(parts: SpriteParts) {
  return [
    "v3",
    `head:${parts.head}`,
    `hair:${parts.hair}`,
    `outfit:${parts.outfit}`,
  ].join("|");
}

type SpriteLayerChoice = {
  hairFront: string;
  hairSide: string;
  head: string;
  outfit: string;
};

const HAIR_LAYER_MAP: Record<
  SpriteHairStyle,
  {
    front: string;
    side: string;
  }
> = {
  "short-umber": { front: "short-umber", side: "short-umber" },
  "short-blonde": { front: "short-blonde", side: "short-blonde" },
  "short-brown": { front: "short-brown", side: "short-brown" },
  "short-charcoal": { front: "short-charcoal", side: "short-charcoal" },
  "short-black": { front: "short-black", side: "short-black" },
  "ponytail-violet": { front: "ponytail-violet", side: "ponytail-violet" },
  "ponytail-blonde": { front: "ponytail-blonde", side: "ponytail-blonde" },
  "ponytail-platinum": { front: "ponytail-platinum", side: "ponytail-platinum" },
};

const HEAD_LAYER_MAP: Record<SpriteHeadTone, string> = {
  porcelain: "porcelain",
  fair: "fair",
  beige: "beige",
  warm: "warm",
  tan: "tan",
  brown: "brown",
  deep: "deep",
};

const OUTFIT_LAYER_MAP: Record<SpriteOutfitStyle, string> = {
  "green-tunic": "green-tunic",
  "blue-vest": "blue-vest",
  "blue-guard": "blue-guard",
  "red-vest": "red-vest",
  "violet-vest": "violet-vest",
  "brown-leather": "brown-leather",
  "tan-traveler": "tan-traveler",
};

function resolveLayerChoice(parts: SpriteParts): SpriteLayerChoice {
  const hairLayers = HAIR_LAYER_MAP[parts.hair] ?? HAIR_LAYER_MAP[DEFAULT_SPRITE_PARTS.hair];
  return {
    hairFront: hairLayers.front,
    hairSide: hairLayers.side,
    head: HEAD_LAYER_MAP[parts.head] ?? HEAD_LAYER_MAP[DEFAULT_SPRITE_PARTS.head],
    outfit: OUTFIT_LAYER_MAP[parts.outfit] ?? OUTFIT_LAYER_MAP[DEFAULT_SPRITE_PARTS.outfit],
  };
}

function spritePartSrc(path: string) {
  return `/sprite-parts/${path}.png`;
}

function PixelSprite({
  avatar,
  variant = "front",
  size = 180,
}: {
  avatar: OnboardingAvatar;
  variant?: PixelSpriteVariant;
  size?: number;
}) {
  const parts = parseSpriteParts(avatar.spriteId);
  const layers = resolveLayerChoice(parts);
  const frameHeight = Math.round(size * 1.16);
  const outfitSrc = spritePartSrc(`clothes/${layers.outfit}`);

  return (
    <div
      role="img"
      aria-label="Selected onboarding sprite"
      className="relative"
      style={{ width: `${size}px`, height: `${frameHeight}px` }}
    >
      <div className="absolute left-[11%] top-[48%] h-[45%] w-[78%]">
        <Image
          src={outfitSrc}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "contain" }}
        />
      </div>
      <div className="absolute left-[10%] top-[5%] h-[52%] w-[80%]">
        <Image
          src={spritePartSrc(`head/${layers.head}`)}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "contain" }}
        />
      </div>
      <div className="absolute left-[14%] top-[-1%] h-[42%] w-[72%]">
        <Image
          src={spritePartSrc(
            `hair/${variant === "side" ? "side" : "front"}/${
              variant === "side" ? layers.hairSide : layers.hairFront
            }`,
          )}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "contain" }}
        />
      </div>
    </div>
  );
}

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
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinProfile, setLinkedinProfile] =
    useState<OnboardingLinkedinProfile | null>(null);
  const [linkedinImportedUrl, setLinkedinImportedUrl] = useState("");
  const [linkedinMeta, setLinkedinMeta] =
    useState<LinkedinIngestResponse["meta"] | null>(null);
  const [importingLinkedin, setImportingLinkedin] = useState(false);
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
    useState<SimulationHorizonPreset>("10_years");
  const [simIntents, setSimIntents] =
    useState<SimulationIntent[]>(["future_timeline"]);
  const [targetOutcome, setTargetOutcome] = useState("");
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
  const storyScrollRef = useRef<HTMLDivElement | null>(null);
  const interviewRequestAbortRef = useRef<AbortController | null>(null);
  const interviewRequestIdRef = useRef(0);
  const interviewSpeechRequestIdRef = useRef(0);
  const interviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const interviewAudioObjectUrlRef = useRef<string | null>(null);
  const lastSpokenAssistantIdRef = useRef<string | null>(null);

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

  const hasLinkedinUrl = useMemo(
    () =>
      /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub)\/.+/i.test(
        linkedinUrl.trim(),
      ),
    [linkedinUrl],
  );
  const linkedinImportedForCurrentUrl = useMemo(() => {
    if (!linkedinImportedUrl) return false;
    return normalizeLinkedinUrl(linkedinImportedUrl) ===
      normalizeLinkedinUrl(linkedinUrl);
  }, [linkedinImportedUrl, linkedinUrl]);
  const onboardingResumeText = useMemo(() => {
    const linkedInSignal = linkedinText
      ? linkedinText.trim()
      : hasLinkedinUrl
      ? `LinkedIn URL: ${linkedinUrl.trim()}`
      : "";
    return [resumeText.trim(), linkedInSignal].filter(Boolean).join("\n\n");
  }, [hasLinkedinUrl, linkedinText, linkedinUrl, resumeText]);
  const simulationSourceLabel = useMemo(() => {
    const hasResumeUpload = resumeText.trim().length > 0;
    const hasLinkedinSource =
      linkedinImportedForCurrentUrl || linkedinText.trim().length > 0 || hasLinkedinUrl;

    if (hasResumeUpload && hasLinkedinSource) {
      return "your uploaded resume and LinkedIn profile";
    }
    if (hasResumeUpload) {
      return "your uploaded resume";
    }
    if (hasLinkedinSource) {
      return "your LinkedIn profile";
    }
    return "the information you shared";
  }, [
    hasLinkedinUrl,
    linkedinImportedForCurrentUrl,
    linkedinText,
    resumeText,
  ]);
  const minimalSimulationSourceSentence = useMemo(() => {
    return `We're going to run a simulation based on ${simulationSourceLabel}. You can always add more context later.`;
  }, [simulationSourceLabel]);
  const guidedSimulationSourceSentence = useMemo(() => {
    return `We're going to run a simulation based on ${simulationSourceLabel} and the conversation. You can always add more context later.`;
  }, [simulationSourceLabel]);
  const storyCharCount = useMemo(() => lifeStory.trim().length, [lifeStory]);
  const hasResumeSignal = useMemo(
    () => resumeText.trim().length > RESUME_MIN_CHARS || linkedinImportedForCurrentUrl,
    [linkedinImportedForCurrentUrl, resumeText],
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
          const payload = (await response.json().catch(() => null)) as InterviewVoiceResponse | null;
          throw new Error(payload?.error ?? "Could not synthesize interviewer voice.");
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
        setVoiceError(err?.message ?? "Interviewer voice is unavailable right now.");
        stopInterviewerSpeech();
      }
    },
    [autoVoiceEnabled, stopInterviewerSpeech],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        await fetchJson<{ success: boolean }>("/api/user/bootstrap", {
          method: "POST",
          timeoutMs: 8_000,
        });
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message ?? "");
        if (
          message.includes("401") ||
          message.toLowerCase().includes("unauthorized")
        ) {
          router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
      } catch {}
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
    lastSpokenAssistantIdRef.current = latestAssistantMessage.id;
    void speakInterviewerText(latestAssistantMessage.content);
  }, [cycleInterviewerSprite, interviewStarted, latestAssistantMessage, speakInterviewerText, stepId]);

  useEffect(() => {
    setStepIndex((index) => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  useEffect(() => {
    if (!linkedinImportedUrl) return;
    if (normalizeLinkedinUrl(linkedinImportedUrl) === normalizeLinkedinUrl(linkedinUrl)) {
      return;
    }
    setLinkedinImportedUrl("");
    setLinkedinProfile(null);
    setLinkedinMeta(null);
    setLinkedinText("");
  }, [linkedinImportedUrl, linkedinUrl]);

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
        },
        body: JSON.stringify({
          resumeText: onboardingResumeText || null,
          lifeStory: conversationLifeStory || lifeStory || null,
          simulationIntents: simIntents,
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
    simIntents,
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

  async function handleLinkedinIngest() {
    const normalizedUrl = normalizeLinkedinUrl(linkedinUrl);
    if (!normalizedUrl) return;
    setError(null);
    setImportingLinkedin(true);
    try {
      const result = await fetchJson<LinkedinIngestResponse>("/api/intake/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileUrl: normalizedUrl,
        }),
        timeoutMs: 120_000,
      });
      setLinkedinUrl(normalizedUrl);
      setLinkedinImportedUrl(normalizedUrl);
      setLinkedinProfile(result.profile);
      setLinkedinMeta(result.meta);
      setLinkedinText(result.text);
    } catch (err: any) {
      setError(err?.message ?? "Could not import LinkedIn profile.");
    } finally {
      setImportingLinkedin(false);
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
      setError("Upload a resume or import LinkedIn first.");
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

  function selectIntent(intent: SimulationIntent) {
    setSimIntents([intent]);
  }

  async function finalizeOnboarding() {
    setSaving(true);
    setError(null);
    try {
      const normalizedIntents =
        simIntents.length > 0 ? [simIntents[0]] : ["future_timeline"];
      const result = await fetchJson<{
        setup: UserSetup;
        notes?: string[];
        meta?: any;
      }>("/api/intake/career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: [onboardingResumeText, lifeStory].filter(Boolean).join("\n\n"),
          onboarding: {
            avatar,
            resumeText: onboardingResumeText || null,
            linkedinProfile: linkedinProfile ?? null,
            lifeStory: lifeStory || null,
            interviewMessages,
            reflections: interviewReflections,
            simulationHorizonPreset: simHorizonPreset,
            simulationIntents: normalizedIntents,
            targetOutcome: targetOutcome.trim() || null,
          },
        }),
        timeoutMs: 120_000,
      });

      clearEvents();
      clearScenarios();
      saveSetup(result.setup);
      await syncLocalSimulationStateToSupabase();
      globalThis?.sessionStorage?.setItem(ONBOARDING_BOOTSTRAP_KEY, "1");
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

  function updateSpriteParts(patch: Partial<SpriteParts>) {
    setAvatar((previous) => {
      const nextParts = {
        ...parseSpriteParts(previous.spriteId),
        ...patch,
      };
      return {
        ...previous,
        spriteId: buildSpriteId(nextParts),
        accessory: accessoryFromHairStyle(nextParts.hair),
        expression: "calm",
      };
    });
  }

  function resetSprite() {
    setAvatar({
      spriteId: buildSpriteId(DEFAULT_SPRITE_PARTS),
      paletteId: "plum",
      accessory: accessoryFromHairStyle(DEFAULT_SPRITE_PARTS.hair),
      expression: "calm",
    });
    setAvatarTab("hair");
  }

  const spriteTileClass =
    "arcane-sprite-tile group";
  const spriteTileSelectedClass =
    "arcane-sprite-tile arcane-sprite-tile-active group";
  const spriteTabClass =
    "arcane-sprite-tab";
  const spriteTabActiveClass =
    "arcane-sprite-tab arcane-sprite-tab-active";
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
      className={`mystic-bg min-h-screen text-zinc-100 ${stepId === "story" ? "h-screen overflow-hidden" : ""}`}
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
        className={`relative z-10 mx-auto flex w-full flex-col px-4 pt-4 sm:px-6 ${
          onboardingContentMaxWidthClass
        } ${stepId === "story" ? "h-[calc(100vh-7rem)] overflow-hidden pb-4" : "min-h-[calc(100vh-7rem)] pb-6"}`}
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
            className={`mx-auto w-full ${onboardingContentMaxWidthClass} ${
              stepId === "story" ? "h-full min-h-0 overflow-hidden" : ""
            }`}
          >
            {stepId === "avatar" ? (
              <div className={onboardingStepPanelClass}>
                <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-7">
                  <div className="space-y-4 md:sticky md:top-6">
                    <div className="arcane-frame rounded-2xl p-4">
                      <p className="arcane-kicker">Portrait Preview</p>
                      <div className="mt-2.5 flex min-h-[172px] items-center justify-center">
                        <PixelSprite avatar={avatar} variant="front" size={136} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetSprite}
                      className="arcane-button-secondary inline-flex h-9 items-center justify-center rounded-full px-4 text-[11px] uppercase tracking-[0.16em]"
                      aria-label="Reset avatar"
                    >
                      <Sparkles className="h-3 w-3" />
                      Reset
                    </button>
                  </div>

                  <div className="pt-1">
                    <p className="arcane-kicker inline-flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-amber-300/90" />
                      Customize Your Wizard
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {AVATAR_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAvatarTab(tab.id)}
                          aria-pressed={avatarTab === tab.id}
                          className={avatarTab === tab.id ? spriteTabActiveClass : spriteTabClass}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {avatarTab === "hair" ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Style</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {HAIR_STYLE_OPTIONS.map((option) => {
                            const nextParts = { ...spriteParts, hair: option.id };
                            const candidate = {
                              ...avatar,
                              spriteId: buildSpriteId(nextParts),
                              accessory: accessoryFromHairStyle(option.id),
                            };
                            const selected = spriteParts.hair === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updateSpriteParts({ hair: option.id })}
                                aria-pressed={selected}
                                className={selected ? spriteTileSelectedClass : spriteTileClass}
                              >
                                <div className="flex items-center justify-center">
                                  <PixelSprite avatar={candidate} size={52} />
                                </div>
                                <span className="arcane-sprite-label mt-1 block text-[11px]">{option.label}</span>
                                {selected ? <span className="arcane-selected-chip">Selected</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {avatarTab === "clothes" ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Color</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {OUTFIT_STYLE_OPTIONS.map((option) => {
                            const nextParts = { ...spriteParts, outfit: option.id };
                            const candidate = { ...avatar, spriteId: buildSpriteId(nextParts) };
                            const selected = spriteParts.outfit === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updateSpriteParts({ outfit: option.id })}
                                aria-pressed={selected}
                                className={selected ? spriteTileSelectedClass : spriteTileClass}
                              >
                                <div className="flex items-center justify-center">
                                  <PixelSprite avatar={candidate} size={52} />
                                </div>
                                <span className="arcane-sprite-label mt-1 block text-[11px]">{option.label}</span>
                                {selected ? <span className="arcane-selected-chip">Selected</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {avatarTab === "head" ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Skin Tone</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {HEAD_TONE_OPTIONS.map((option) => {
                            const nextParts = { ...spriteParts, head: option.id };
                            const candidate = { ...avatar, spriteId: buildSpriteId(nextParts) };
                            const selected = spriteParts.head === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updateSpriteParts({ head: option.id })}
                                aria-pressed={selected}
                                className={selected ? spriteTileSelectedClass : spriteTileClass}
                              >
                                <div className="flex items-center justify-center">
                                  <PixelSprite avatar={candidate} size={52} />
                                </div>
                                <span className="arcane-sprite-label mt-1 block text-[11px]">{option.label}</span>
                                {selected ? <span className="arcane-selected-chip">Selected</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {stepId === "path" ? (
              <div className="mx-auto w-full max-w-6xl py-1 sm:py-2">
                <div className="grid gap-7 md:grid-cols-2 md:gap-12">
                  <button
                    type="button"
                    onClick={() => chooseOnboardingPath("minimal")}
                    className={`arcane-panel onboarding-path-card group relative flex min-h-[18rem] flex-col overflow-hidden rounded-3xl p-6 text-left transition md:min-h-[20rem] md:p-7 ${
                      onboardingPath === "minimal"
                        ? "arcane-panel-outline-fat bg-[linear-gradient(180deg,rgba(22,36,64,0.95),rgba(10,16,30,0.96))] shadow-[0_0_0_2px_rgba(168,193,255,0.38),0_18px_36px_rgba(0,0,0,0.42)]"
                        : "arcane-panel-outline-thin bg-[linear-gradient(180deg,rgba(9,15,28,0.9),rgba(7,12,23,0.94))] opacity-[0.95] hover:opacity-100"
                    }`}
                    aria-pressed={onboardingPath === "minimal"}
                  >
                    {onboardingPath === "minimal" ? (
                      <span className="absolute right-3 top-3 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-900">
                        Selected
                      </span>
                    ) : null}
                    <p
                      className={`arcane-kicker text-[10px] ${
                        onboardingPath === "minimal" ? "text-blue-200/90" : "text-zinc-400"
                      }`}
                    >
                      Fast Setup
                    </p>
                    <p className="arcane-display-title mt-1 text-2xl font-semibold leading-tight text-zinc-100 md:text-[1.75rem]">
                      Minimal Path
                    </p>
                    <ul className="mt-3 max-w-[36ch] list-disc space-y-1.5 pl-5 pr-14 text-[0.93rem] leading-relaxed text-zinc-300">
                      <li>Upload your resume or import LinkedIn.</li>
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
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => chooseOnboardingPath("guided")}
                    className={`arcane-panel onboarding-path-card group relative flex min-h-[18rem] flex-col overflow-hidden rounded-3xl p-6 text-left transition md:min-h-[20rem] md:p-7 ${
                      onboardingPath === "guided"
                        ? "arcane-panel-outline-fat bg-[linear-gradient(180deg,rgba(22,36,64,0.95),rgba(10,16,30,0.96))] shadow-[0_0_0_2px_rgba(168,193,255,0.38),0_18px_36px_rgba(0,0,0,0.42)]"
                        : "arcane-panel-outline-thin bg-[linear-gradient(180deg,rgba(9,15,28,0.9),rgba(7,12,23,0.94))] opacity-[0.95] hover:opacity-100"
                    }`}
                    aria-pressed={onboardingPath === "guided"}
                  >
                    {onboardingPath === "guided" ? (
                      <span className="absolute right-3 top-3 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-900">
                        Selected
                      </span>
                    ) : null}
                    <p
                      className={`arcane-kicker text-[10px] ${
                        onboardingPath === "guided" ? "text-blue-200/90" : "text-zinc-400"
                      }`}
                    >
                      Guided Setup
                    </p>
                    <p className="arcane-display-title mt-1 text-2xl font-semibold leading-tight text-zinc-100 md:text-[1.75rem]">
                      Detailed Path
                    </p>
                    <ul className="mt-3 max-w-[37ch] list-disc space-y-1.5 pl-5 pr-14 text-[0.93rem] leading-relaxed text-zinc-300">
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
                      <p className="text-sm text-zinc-200">Import LinkedIn URL</p>
                      <div className="mt-3 space-y-2">
                        <Input
                          value={linkedinUrl}
                          onChange={(event) => setLinkedinUrl(event.target.value)}
                          placeholder="https://www.linkedin.com/in/dannywchen/"
                          className="w-full max-w-[460px] rounded-lg border-0 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <Button
                          type="button"
                          onClick={() => void handleLinkedinIngest()}
                          disabled={!hasLinkedinUrl || importingLinkedin}
                          className="arcane-button-secondary h-9 rounded-lg px-4 disabled:opacity-40"
                        >
                          {importingLinkedin ? "Importing..." : "Import"}
                        </Button>
                      </div>
                      {linkedinImportedForCurrentUrl && linkedinProfile ? (
                        <p className="mt-2 text-xs text-zinc-400">
                          Imported profile
                          {linkedinProfile.fullName ? `: ${linkedinProfile.fullName}` : ""}.
                        </p>
                      ) : null}
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
                  <Button
                    type="button"
                    onClick={goToSimulationStep}
                    disabled={saving}
                    className="arcane-button-primary h-9 rounded-md px-4"
                  >
                    Continue to simulations
                  </Button>
                </div>

                <div className="grid min-h-0 flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="relative hidden min-h-0 items-center justify-center px-4 pb-2 pt-4 lg:flex">
                    <Image
                      src={currentInterviewerSprite}
                      alt="AI interviewer sprite"
                      width={960}
                      height={1200}
                      priority={stepId === "story"}
                      className={`h-auto max-h-[min(76vh,760px)] w-auto max-w-full object-contain object-top drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)] transition-transform duration-500 ${
                        audioPlaying ? "scale-[1.01]" : "scale-100"
                      }`}
                      sizes="(max-width: 1024px) 94vw, 62vw"
                    />
                  </div>

                  <div className="flex h-full min-h-0 flex-col rounded-[24px] bg-zinc-900/55 p-3 sm:p-4">
                    <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">Interview</p>
                          <p className="text-xs text-zinc-400">
                            Type or use the mic. Scroll to review full conversation.
                          </p>
                        </div>
                        <div className="rounded-full border border-white/15 bg-zinc-950/70 px-3 py-1 text-[11px] text-zinc-300">
                          {!interviewStarted
                            ? "Not started"
                            : activeVoiceTarget === "story"
                            ? "Recording"
                            : "Idle"}
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
                              return isAssistant ? (
                                <div key={message.id} className="flex justify-start pr-8 sm:pr-14">
                                  <p className={storyBubbleAssistantClass}>{message.content}</p>
                                </div>
                              ) : (
                                <div
                                  key={message.id}
                                  className="flex w-full justify-end gap-1.5 pl-8 sm:gap-2 sm:pl-12"
                                >
                                  <div className={storyBubbleUserClass}>{message.content}</div>
                                  <div className="mb-0.5 shrink-0 self-end rounded-full border border-zinc-500/60 bg-zinc-800 p-0.5">
                                    <PixelSprite avatar={avatar} size={26} />
                                  </div>
                                </div>
                              );
                            })}
                            {interviewLoading ? (
                              <div className="inline-flex items-center rounded-full border border-white/15 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                                Thinking...
                              </div>
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
            ) : null}

            {stepId === "simulation" ? (
              <div className="mx-auto w-full max-w-6xl">
                <div className="rounded-[28px] bg-zinc-950/95 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="arcane-display-title text-2xl font-semibold text-zinc-50">
                        Start your simulation
                      </h2>
                      <p className="mt-2 text-sm text-zinc-300">
                        {onboardingPath === "minimal"
                          ? minimalSimulationSourceSentence
                          : guidedSimulationSourceSentence}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
                    <div className="arcane-panel arcane-panel-outline-thin rounded-2xl p-4">
                      <p className="text-sm font-medium text-zinc-100">Choose horizon</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {SIMULATION_HORIZON_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSimHorizonPreset(option.id)}
                            className={`rounded-xl px-3 py-3 text-left transition ${
                              simHorizonPreset === option.id
                                ? "bg-zinc-100 text-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]"
                                : "bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <p className="text-sm font-medium">{option.label}</p>
                            <p
                              className={`mt-1 text-xs ${
                                simHorizonPreset === option.id
                                  ? "text-zinc-700"
                                  : "text-zinc-400"
                              }`}
                            >
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="arcane-panel arcane-panel-outline-thin rounded-2xl p-4">
                      <p className="text-sm font-medium text-zinc-100">Simulation mode</p>
                      <div className="mt-3 grid gap-2">
                        {SIMULATION_INTENT_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => selectIntent(option.id)}
                            className={`rounded-xl px-3 py-3 text-left transition ${
                              simIntents.includes(option.id)
                                ? "bg-zinc-100 text-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]"
                                : "bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <p className="text-sm font-medium">{option.label}</p>
                            <p
                              className={`mt-1 text-xs ${
                                simIntents.includes(option.id)
                                  ? "text-zinc-700"
                                  : "text-zinc-400"
                              }`}
                            >
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="arcane-panel arcane-panel-outline-fat mt-4 rounded-2xl p-4">
                    <p className="text-sm font-medium text-zinc-100">Target outcome (optional)</p>
                    <Textarea
                      value={targetOutcome}
                      onChange={(event) => setTargetOutcome(event.target.value)}
                      placeholder="What would happen if I did X? What would success look like?"
                      className="mt-3 min-h-[92px] rounded-xl border-0 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
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
              className={`flex items-center gap-2 ${
                stepId === "avatar" ? "justify-end sm:min-w-[340px]" : ""
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
                  Continue to simulation
                </Button>
              ) : null}
            </div>
          </footer>
        </div>

    </div>
  );
}
