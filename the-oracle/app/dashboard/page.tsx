"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Clock3,
  Download,
  Flag,
  PlusCircle,
  Settings,
  Sparkles,
  Pencil,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { hydrateLocalSimulationStateFromSupabase } from "@/lib/client/cloud-state";
import { loadSetup } from "@/lib/client/setup-store";
import { PixelAvatar } from "@/components/shared/pixel-avatar";
import { TutorialModal } from "@/components/tutorial/tutorial-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ClassicLoader from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import { SpriteEditModal } from "@/components/dashboard/sprite-edit-modal";
import styles from "./dashboard.module.css";
import type {
  OnboardingAvatar,
  SimulationActionOption,
  SimulationHorizonPreset,
  SimulationMetrics,
  SimulationMode,
  SimulationNode,
  SimulationRun,
  UserSetup,
} from "@/lib/types";

type SimulationDetailResponse = {
  run: SimulationRun;
  nodes: SimulationNode[];
};

type SimulationListResponse = {
  simulations: SimulationRun[];
  activeSimulationId: string | null;
  activeSimulation?: SimulationDetailResponse;
};

type EndSimulationResponse = SimulationDetailResponse & {
  wrap?: {
    title: string;
    mode: SimulationMode;
    totalNodes: number;
    durationDays: number;
    topGrowthMetric: string;
    topGrowthValue: number;
    topStoryMoments: Array<{ seq: number; label: string; story: string }>;
    summaryParagraph: string;
    finalMetrics: SimulationMetrics;
  };
};

const ONBOARDING_DASHBOARD_TRANSITION_KEY = "deep-sim.onboarding-dashboard-transition.v1";

const metricCards: Array<{
  key: keyof SimulationMetrics;
  label: string;
  format: (value: number) => string;
  detail: string;
}> = [
    {
      key: "projectedDeathDate",
      label: "Proj. Death Date",
      format: (value) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
      detail: "Expected longevity based on compounding health and stress signals.",
    },
    {
      key: "netWorth",
      label: "Net Worth",
      format: (value) => `$${Math.round(value).toLocaleString()}`,
      detail: "Long-horizon wealth accumulation estimate across all timeline actions.",
    },
    {
      key: "salary",
      label: "Salary",
      format: (value) => `$${Math.round(value).toLocaleString()}`,
      detail: "Estimated yearly compensation trajectory based on your path so far.",
    },
    {
      key: "relationships",
      label: "Relationships",
      format: (value) => `${value.toFixed(1)} hrs/wk`,
      detail: "Measures weekly time successfully invested in relationships and social connection.",
    },
    {
      key: "freeTime",
      label: "Free Time",
      format: (value) => `${value.toFixed(1)} hrs/wk`,
      detail: "Available weekly breathing room for recovery and exploration.",
    },
    {
      key: "career",
      label: "Career",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Tracks career momentum, opportunities, and directional confidence.",
    },
    {
      key: "health",
      label: "Health",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Composite health marker combining energy, rhythm, and resilience.",
    },
    {
      key: "stress",
      label: "Stress",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Higher values indicate sustained pressure and lower buffer capacity.",
    },
    {
      key: "fulfillment",
      label: "Fulfillment",
      format: (value) => `${Math.round(value)}/100`,
      detail: "How aligned your daily decisions are with meaning and personal priorities.",
    },
  ];

const createDefaults = {
  mode: "manual_step" as SimulationMode,
  horizonPreset: "10_years" as SimulationHorizonPreset,
};

const actionLoadingPhrases = [
  "Reading the leaves...",
  "The oracle stirs...",
  "Patterns emerging...",
  "Your fate awaits...",
  "Leaves settling...",
];

function cleanText(value: unknown, maxChars = 220) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function scoreColor(value: number) {
  if (value >= 72) return "text-white";
  if (value >= 48) return "text-gray-300";
  return "text-gray-500";
}

async function svgToPng(svgString: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    const img = new window.Image();
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/png");
    };
    img.onerror = (err) => {
      reject(err instanceof Error ? err : new Error("Image loading failed"));
    };
    img.src = url;
  });
}

function renderTrend(delta: number, formatLabel: (v: number) => string) {
  const abs = Math.abs(delta);
  const formatted = formatLabel(abs);

  if (delta > 0) {
    return (
      <span className={styles.trendUp}>
        ▲ {formatted}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className={styles.trendDown}>
        ▼ {formatted}
      </span>
    );
  }
  return <span className="text-white/20">—</span>;
}

function metricValue(
  metrics: SimulationMetrics | undefined,
  key: keyof SimulationMetrics,
) {
  if (!metrics) return 0;
  const value = metrics[key];
  return Number.isFinite(value) ? value : 0;
}

function formatMetricDelta(key: keyof SimulationMetrics, value: number) {
  if (key === "projectedDeathDate") {
    const days = Math.round(value / (1000 * 60 * 60 * 24));
    return `${Math.abs(days)} days`;
  }
  if (key === "relationships" || key === "freeTime") {
    return `${Math.abs(value).toFixed(1)} hrs`;
  }
  if (key === "netWorth" || key === "salary" || key === "monthlyExpenses") {
    return `$${Math.round(Math.abs(value)).toLocaleString()}`;
  }
  return String(Math.round(Math.abs(value)));
}

function asAvatar(setup: UserSetup | null): OnboardingAvatar {
  return (
    setup?.onboarding?.avatar ?? {
      spriteId: "v3|head:beige|hair:short-brown|outfit:blue-guard",
      paletteId: "plum",
      accessory: "none",
      expression: "calm",
    }
  );
}

function chartPoints(nodes: SimulationNode[], key: keyof SimulationMetrics) {
  if (!nodes.length) return [0];
  const desired = 18;
  const step = Math.max(1, Math.floor(nodes.length / desired));
  const points: number[] = [];
  for (let i = 0; i < nodes.length; i += step) {
    points.push(metricValue(nodes[i].metricsSnapshot, key));
  }
  const last = metricValue(nodes[nodes.length - 1].metricsSnapshot, key);
  if (points[points.length - 1] !== last) points.push(last);
  return points.slice(0, desired);
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const forcedId = searchParams.get("id");

  const [setup, setSetup] = useState<UserSetup | null>(() => {
    if (typeof window === "undefined") return null;
    return loadSetup();
  });
  const [simulations, setSimulations] = useState<SimulationRun[]>([]);
  const [activeRun, setActiveRun] = useState<SimulationRun | null>(null);
  const [nodes, setNodes] = useState<SimulationNode[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<keyof SimulationMetrics | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [customAction, setCustomAction] = useState("");
  const [createMode, setCreateMode] = useState(createDefaults.mode);
  const [createHorizonPreset, setCreateHorizonPreset] = useState(createDefaults.horizonPreset);
  const [wrapSummary, setWrapSummary] = useState<EndSimulationResponse["wrap"] | null>(null);
  const [creatingSimulation, setCreatingSimulation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [endingSimulation, setEndingSimulation] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnboardingTransition, setShowOnboardingTransition] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ONBOARDING_DASHBOARD_TRANSITION_KEY) === "1";
  });
  const [fadeOutTransition, setFadeOutTransition] = useState(false);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isSpriteEditModalOpen, setIsSpriteEditModalOpen] = useState(false);

  const avatar = useMemo(() => asAvatar(setup), [setup]);
  const latestNode = nodes[nodes.length - 1] ?? null;
  const latestNodeId = latestNode?.id ?? null;
  const focusedNode = useMemo(
    () => (focusedNodeId ? nodes.find((node) => node.id === focusedNodeId) ?? latestNode : latestNode),
    [focusedNodeId, latestNode, nodes],
  );
  const runMetrics = focusedNode?.metricsSnapshot ?? latestNode?.metricsSnapshot ?? activeRun?.latestMetrics;
  const baselineMetrics = activeRun?.baselineMetrics;

  const manualOptions = useMemo(() => {
    if (!latestNode) return [];
    if (!Array.isArray(latestNode.nextOptions)) return [];
    return latestNode.nextOptions.slice(0, 3);
  }, [latestNode]);

  const headlineStory = useMemo(() => {
    if (!focusedNode) {
      return "Your simulation is initializing. Once the first node appears, story and metric changes will stream here.";
    }
    return focusedNode.story;
  }, [focusedNode]);

  const changelog = focusedNode?.changelog ?? [];

  useEffect(() => {
    if (!latestNodeId) {
      setFocusedNodeId(null);
      return;
    }
    setFocusedNodeId(latestNodeId);
  }, [latestNodeId]);

  useEffect(() => {
    if (!showOnboardingTransition) return;

    window.sessionStorage.removeItem(ONBOARDING_DASHBOARD_TRANSITION_KEY);

    const darkFadeTimer = window.setTimeout(() => {
      setFadeOutTransition(true);
    }, 1650);
    const finishTimer = window.setTimeout(() => {
      setShowOnboardingTransition(false);
    }, 2350);

    return () => {
      window.clearTimeout(darkFadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [showOnboardingTransition]);

  useEffect(() => {
    if (bootLoading || showOnboardingTransition) return;
    if (setup && !setup.preferences?.hasCompletedTutorial) {
      setShowTutorial(true);
    }
  }, [bootLoading, showOnboardingTransition, setup]);

  useEffect(() => {
    if (!actionLoading) return;
    const phraseTimer = window.setInterval(() => {
      setLoadingPhraseIndex((current) => (current + 1) % actionLoadingPhrases.length);
    }, 1800);

    return () => {
      window.clearInterval(phraseTimer);
    };
  }, [actionLoading]);

  const bootDashboard = useCallback(async () => {
    setBootLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }

      const [syncResult, listResult] = await Promise.all([
        hydrateLocalSimulationStateFromSupabase().catch(() => ({ setup: null })),
        authFetch<SimulationListResponse>("/api/simulation?bootstrap=1&includeActive=1&limit=50"),
      ]);

      if (syncResult?.setup) {
        setSetup(syncResult.setup);
      } else {
        setSetup(loadSetup());
      }

      setSimulations(listResult.simulations ?? []);
      if (listResult.activeSimulation) {
        setActiveRun(listResult.activeSimulation.run);
        setNodes(listResult.activeSimulation.nodes ?? []);
      } else if (listResult.activeSimulationId) {
        const active = await authFetch<SimulationDetailResponse>(`/api/simulation/${listResult.activeSimulationId}?limit=500`);
        setActiveRun(active.run);
        setNodes(active.nodes ?? []);
      } else {
        setActiveRun(null);
        setNodes([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load simulation dashboard.");
    } finally {
      setBootLoading(false);
    }
  }, []);


  const selectSimulation = useCallback(async (simulationId: string) => {
    if (!simulationId) return;
    setError(null);
    try {
      const detail = await authFetch<SimulationDetailResponse>(`/api/simulation/${simulationId}?limit=500`);
      setActiveRun(detail.run);
      setNodes(detail.nodes ?? []);
      setWrapSummary((detail.run.summary?.wrap as EndSimulationResponse["wrap"]) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to switch simulation.");
    }
  }, []);

  const createSimulation = useCallback(async () => {
    setCreatingSimulation(true);
    setError(null);
    try {
      const created = await authFetch<SimulationDetailResponse>("/api/simulation", {
        method: "POST",
        body: JSON.stringify({
          mode: createMode,
          horizonPreset: createHorizonPreset,
        }),
      });
      setActiveRun(created.run);
      const createdNodes = created.nodes ?? [];
      setNodes(createdNodes);
      setFocusedNodeId(createdNodes.length ? createdNodes[createdNodes.length - 1].id : null);
      const refreshed = await authFetch<SimulationListResponse>("/api/simulation?limit=50");
      setSimulations(refreshed.simulations ?? []);
      setWrapSummary(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create simulation.");
    } finally {
      setCreatingSimulation(false);
    }
  }, [createHorizonPreset, createMode]);

  const performStep = useCallback(
    async (optionOverride?: SimulationActionOption) => {
      if (!activeRun) return;
      if (activeRun.mode !== "manual_step") return;
      if (activeRun.status !== "active") return;

      const option = optionOverride || manualOptions.find((o) => o.id === selectedOptionId);
      const custom = cleanText(customAction, 220);
      if (!option && !custom) return;

      setActionLoading(true);
      setError(null);
      try {
        const updated = await authFetch<SimulationDetailResponse>(
          `/api/simulation/${activeRun.id}/step`,
          {
            method: "POST",
            body: JSON.stringify({
              optionId: option?.id,
              customAction: option ? undefined : custom,
            }),
          },
        );
        setActiveRun(updated.run);
        const updatedNodes = updated.nodes ?? [];
        setNodes(updatedNodes);
        setFocusedNodeId(updatedNodes.length ? updatedNodes[updatedNodes.length - 1].id : null);
        setSelectedOptionId(null);
        if (!option) {
          setCustomAction("");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unable to apply simulation step.");
      } finally {
        setActionLoading(false);
      }
    },
    [activeRun, customAction, manualOptions, selectedOptionId],
  );

  useEffect(() => {
    if (forcedId) {
      void selectSimulation(forcedId);
    } else {
      void bootDashboard();
    }
  }, [bootDashboard, forcedId, selectSimulation]);

  const endGame = useCallback(async () => {
    if (!activeRun || endingSimulation) return;
    setEndingSimulation(true);
    setError(null);
    try {
      const result = await authFetch<EndSimulationResponse>(`/api/simulation/${activeRun.id}/end`, {
        method: "POST",
      });
      setActiveRun(result.run);
      const endedNodes = result.nodes ?? [];
      setNodes(endedNodes);
      setFocusedNodeId(endedNodes.length ? endedNodes[endedNodes.length - 1].id : null);
      setWrapSummary(result.wrap ?? null);
      setShowEndDialog(true);
      const refreshed = await authFetch<SimulationListResponse>("/api/simulation?limit=50");
      setSimulations(refreshed.simulations ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to end simulation.");
    } finally {
      setEndingSimulation(false);
    }
  }, [activeRun, endingSimulation]);

  const isWrapVisible = Boolean(wrapSummary);

  const downloadWrapGraphic = useCallback(async () => {
    if (!wrapSummary || !activeRun) return;

    setEndingSimulation(true); // Re-use loading state for download
    try {
      const avatar = asAvatar(setup);
      const parts = (() => {
        const values = Object.fromEntries(
          avatar.spriteId
            .split("|")
            .map((segment) => segment.trim())
            .map((segment) => segment.split(":").map((part) => part.trim()))
            .filter((parts) => parts.length === 2 && parts[0] && parts[1]),
        ) as Record<string, string>;

        return {
          head: values.head || "beige",
          hair: values.hair || "short-brown",
          outfit: values.outfit || "blue-guard",
        };
      })();

      // Simple mapping for hair front paths (mirroring pixel-avatar.tsx mapping indirectly)
      const hairFile = parts.hair;
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      const getBase64 = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const blob = await res.blob();
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return url;
        }
      };

      const [clothesB64, headB64, hairB64] = await Promise.all([
        getBase64(`${baseUrl}/sprite-parts/clothes/${parts.outfit}.png`),
        getBase64(`${baseUrl}/sprite-parts/head/${parts.head}.png`),
        getBase64(`${baseUrl}/sprite-parts/hair/front/${hairFile}.png`),
      ]);

      const paragraphText = cleanText(wrapSummary.summaryParagraph, 160);
      const words = paragraphText.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + word).length > 28) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine) lines.push(currentLine.trim());

      const maxLines = 6;
      const displayLines = lines.slice(0, maxLines);
      const lineHeight = 38;
      const startY = 1180 - (displayLines.length * lineHeight);

      const journeyTextTags = displayLines.map((line, i) =>
        `<text x="980" y="${startY + 40 + (i * lineHeight)}" fill="#ffffff" font-size="24" font-family="monospace" text-anchor="end">${line}</text>`
      ).join('\\n  ');

      const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="background-color: #000;">
  <rect width="1080" height="1350" fill="#000000"/>
  
  <!-- User Sprite - High Center -->
  <g transform="translate(340, 150) scale(2.8)">
    <image href="${clothesB64}" x="15" y="65" width="110" height="60" style="image-rendering: pixelated;"/>
    <image href="${headB64}" x="14" y="6" width="112" height="72" style="image-rendering: pixelated;"/>
    <image href="${hairB64}" x="20" y="-1" width="100" height="58" style="image-rendering: pixelated;"/>
  </g>

  <!-- Title & Meta -->
  <text x="540" y="580" fill="#ffffff" font-size="64" font-family="monospace" font-weight="900" text-anchor="middle" style="text-transform: uppercase;">${cleanText(wrapSummary.title, 24)}</text>
  <text x="540" y="640" fill="#888888" font-size="28" font-family="monospace" text-anchor="middle" letter-spacing="4">THE ORACLE WRAPPED // ${activeRun.mode.replace("_", " ").toUpperCase()}</text>

  <!-- Metrics Grid - Bottom Left -->
  <g transform="translate(100, 850)">
    <text y="0" fill="#ffffff" font-size="32" font-family="monospace" font-weight="700">FINAL METRICS</text>
    <text y="60" fill="#4ade80" font-size="42" font-family="monospace" font-weight="900">Career: ${Math.round(wrapSummary.finalMetrics.career)}</text>
    <text y="120" fill="#fbbf24" font-size="42" font-family="monospace" font-weight="900">Salary: $${Math.round(wrapSummary.finalMetrics.salary).toLocaleString()}</text>
    <text y="180" fill="#f87171" font-size="42" font-family="monospace" font-weight="900">Health: ${Math.round(wrapSummary.finalMetrics.health)}</text>
    <text y="240" fill="#60a5fa" font-size="42" font-family="monospace" font-weight="900">Social: ${Math.round(wrapSummary.finalMetrics.relationships)}</text>
    <text y="300" fill="#ffffff" font-size="28" font-family="monospace" opacity="0.6">Net Worth: $${Math.round(wrapSummary.finalMetrics.netWorth).toLocaleString()}</text>
  </g>

  <!-- Summary Text - Bottom Right -->
  <text x="980" y="${startY}" fill="#ffffff" font-size="18" font-family="monospace" font-weight="700" text-anchor="end" opacity="0.5" letter-spacing="2">YOUR JOURNEY</text>
  ${journeyTextTags}

  <!-- Logo -->
  <text x="980" y="1280" fill="#ffffff" font-size="40" font-family="monospace" font-weight="900" text-anchor="end" opacity="0.8">THE ORACLE</text>
</svg>`.trim();

      const blob = await svgToPng(svg, 1080, 1350);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activeRun.title.replace(/\s+/g, "-").toLowerCase()}-wrapped.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to export PNG.");
    } finally {
      setEndingSimulation(false);
    }
  }, [activeRun, wrapSummary, setup]);

  const activeMetricConfig = metricCards.find((metric) => metric.key === selectedMetric) ?? null;
  const activeMetricSeries = selectedMetric ? chartPoints(nodes, selectedMetric) : [];
  const activeMetricCurrent = selectedMetric ? metricValue(runMetrics, selectedMetric) : 0;
  const activeMetricBaseline = selectedMetric ? metricValue(baselineMetrics, selectedMetric) : 0;
  const activeMetricDelta = activeMetricCurrent - activeMetricBaseline;

  if (bootLoading) {
    return (
      <>
        <main className={styles.loadingShell}>
          <ClassicLoader />
        </main>
        {showOnboardingTransition ? (
          <div
            className={`${styles.onboardingTransitionOverlay} ${fadeOutTransition ? styles.onboardingTransitionFadeOut : ""
              }`}
            aria-hidden
          >
            <Image
              src="/cloudy_transition.gif"
              alt=""
              fill
              unoptimized
              priority
              sizes="100vw"
              className={styles.onboardingTransitionGif}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <main
        className={`${styles.page} ${showOnboardingTransition ? styles.pageHidden : ""} ${isWrapVisible ? styles.pageScrollable : ""}`}
      >
        <div className={styles.mobileHeader}>
          <button
            type="button"
            onClick={() => setShowMobileStats(!showMobileStats)}
            className={styles.mobileStatsToggle}
          >
            <BarChart3 className="h-4 w-4" />
            Stats
          </button>
          <div className={styles.mobileTopActions}>
            <Link href="/settings" className={styles.sideAction}>
              <Settings className="h-4 w-4" />
            </Link>
            <Button
              type="button"
              onClick={() => void endGame()}
              disabled={!activeRun || activeRun.status === "ended" || endingSimulation}
              className={styles.sideEndButton}
            >
              <Flag className="h-4 w-4" />
              {endingSimulation ? <ClassicLoader size="sm" /> : "End"}
            </Button>
          </div>
        </div>

        <div className={styles.shell}>
          {activeRun ? (
            <div className={`${styles.frameShell} ${isWrapVisible ? styles.frameShellWrapVisible : ""}`}>
              <div className={`${styles.mainGrid} ${isWrapVisible ? styles.mainGridWrapVisible : ""}`}>
                <section className={`${styles.leftColumn} ${isWrapVisible ? styles.leftColumnWrapVisible : ""}`}>
                  <div className={`${styles.timelinePanel} arcane-panel arcane-panel-outline-fat`}>
                    <div className={styles.timelineTopRow}>
                      <p className={styles.timelineLabel}>Timeline</p>
                    </div>
                    <p className={styles.timelineMeta}>
                      {activeRun.title} • {nodes.length} nodes • day {activeRun.currentDay}
                    </p>
                    <div className={styles.timelineScroll}>
                      <div className={styles.timelineTrack}>
                        {nodes.map((node, index) => (
                          <div key={node.id} className={styles.timelineStep}>
                            <button
                              type="button"
                              onClick={() => setFocusedNodeId(node.id)}
                              className={`${styles.timelineNode} ${node.id === focusedNode?.id ? styles.timelineNodeActive : ""}`}
                            >
                              {node.seq}
                            </button>
                            {index < nodes.length - 1 ? (
                              <span className={styles.timelineConnector} aria-hidden />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.stagePanel} ${isWrapVisible ? styles.stagePanelWrapVisible : ""}`}>
                    <div className={styles.avatarArea}>
                      <div className={styles.avatarContainer}>
                        <div className={styles.avatarWrapper}>
                          <PixelAvatar avatar={avatar} size={230} />
                          <button
                            type="button"
                            onClick={() => setIsSpriteEditModalOpen(true)}
                            className={styles.editAvatarButton}
                            title="Edit Avatar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className={`${styles.bubbleContainer} ${isWrapVisible ? styles.bubbleContainerWrapVisible : ""}`}>
                        <p className={styles.bubbleTitle}>Story + changelog</p>
                        <p className={styles.bubbleBody}>{headlineStory}</p>
                        <div className={styles.changeList}>
                          {changelog.length > 0 ? (
                            changelog.map((entry, index) => {
                              const isPositive = entry.includes("+") || entry.toLowerCase().includes("increased");
                              const isNegative = entry.includes("-") || entry.toLowerCase().includes("decreased");
                              const icon = isPositive ? "▲" : isNegative ? "▼" : "•";
                              const colorClass = isPositive ? styles.trendUp : isNegative ? styles.trendDown : "";

                              return (
                                <p key={`${entry}-${index}`} className={colorClass}>
                                  {icon} {entry.replace(/^[+-]\s*/, "")}
                                </p>
                              );
                            })
                          ) : (
                            <p>No metric change logged on this node.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`${styles.optionsArea} ${isWrapVisible ? styles.optionsAreaWrapVisible : ""}`}>
                      {activeRun.mode === "manual_step" && activeRun.status === "active" ? (
                        <>
                          <div className={styles.optionsGrid}>
                            {manualOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setSelectedOptionId(option.id);
                                  setCustomAction(""); // Clear custom if picking a preset
                                }}
                                disabled={actionLoading}
                                className={`${styles.optionCard} ${selectedOptionId === option.id ? styles.optionCardSelected : ""}`}
                              >
                                <p className={styles.optionCardTitle}>{option.title}</p>
                                <p className={styles.optionCardDesc}>{option.description}</p>
                                <p className={styles.optionCardHint}>{option.impactHint}</p>
                              </button>
                            ))}
                            <div
                              className={`${styles.customOptionCard} ${selectedOptionId === "custom" ? styles.optionCardSelected : ""}`}
                              onClick={() => setSelectedOptionId("custom")}
                            >
                              <p className={styles.customTitle}>Custom (manual)</p>
                              <Textarea
                                value={customAction}
                                onFocus={() => setSelectedOptionId("custom")}
                                onChange={(event) => {
                                  setCustomAction(event.target.value);
                                  setSelectedOptionId("custom");
                                }}
                                placeholder="Define your own next action..."
                                className={styles.customInput}
                              />
                            </div>
                          </div>
                          {selectedOptionId && (
                            <div className="mt-4 flex justify-center">
                              <Button
                                onClick={() => void performStep()}
                                disabled={
                                  actionLoading ||
                                  (selectedOptionId === "custom" && !cleanText(customAction, 220))
                                }
                                className="w-full h-12 bg-white text-black font-bold uppercase transition-all hover:bg-white/90 border-0"
                              >
                                {actionLoading ? <ClassicLoader size="sm" /> : "Confirm Choice"}
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className={styles.autoHintBlock}>
                          <p className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            {activeRun.mode === "auto_future"
                              ? "Auto mode generated this timeline from your memory context."
                              : "This simulation is ended. Start a new run to continue."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <aside className={`${styles.statsPanel} ${showMobileStats ? styles.statsPanelMobileOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.mobileDrawerClose}
                    onClick={() => setShowMobileStats(false)}
                  >
                    ×
                  </button>
                  <div className={styles.statsHeader}>
                    <p className={styles.statsTitle}>Stats</p>
                    <div className={`${styles.statsActions} sm:flex hidden`}>
                      <Link href="/settings" className={styles.sideAction}>
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                      <Button
                        type="button"
                        onClick={() => void endGame()}
                        disabled={activeRun.status === "ended" || endingSimulation}
                        className={styles.sideEndButton}
                      >
                        <Flag className="h-4 w-4" />
                        {endingSimulation ? <ClassicLoader size="sm" /> : "End"}
                      </Button>
                    </div>
                  </div>

                  <div className={styles.statsList}>
                    {metricCards.map((metric) => {
                      const value = metricValue(runMetrics, metric.key);
                      const baseline = metricValue(baselineMetrics, metric.key);
                      const delta = value - baseline;
                      return (
                        <button
                          key={metric.key}
                          type="button"
                          onClick={() => setSelectedMetric(metric.key)}
                          className={styles.statCard}
                        >
                          <div className={styles.statTop}>
                            <p className={styles.statLabel}>{metric.label}</p>
                            <p className={`${styles.statValue} ${scoreColor(value)}`}>
                              {metric.format(value)}
                            </p>
                          </div>
                          <p className={styles.statDelta}>
                            {renderTrend(delta, () => formatMetricDelta(metric.key, delta))}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            <section className={styles.emptyState}>
              <p>No active simulation found.</p>
              <div className={styles.emptyControls}>
                <Link href="/dashboard/all">
                  <Button className={styles.compactButton}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Go to All Simulations
                  </Button>
                </Link>
              </div>
            </section>
          )}

          {wrapSummary ? (
            <section className={styles.wrapPanel}>
              <div className={styles.wrapHeader}>
                <div>
                  <p className={styles.wrapLabel}>Simulation End</p>
                  <h2 className={styles.wrapTitle}>Wrapped: {wrapSummary.title}</h2>
                  <p className={styles.wrapText}>{wrapSummary.summaryParagraph}</p>
                </div>
              </div>
              <div className={styles.wrapDownloadRow}>
                <Button type="button" onClick={downloadWrapGraphic} className={styles.wrapDownload}>
                  <Download className="mr-1 h-4 w-4" />
                  Download Graphic
                </Button>
              </div>
              <div className={styles.wrapGrid}>
                <div className={styles.wrapStat}>
                  <p className={styles.wrapStatLabel}>Top Growth Metric</p>
                  <p className={styles.wrapStatValue}>
                    {wrapSummary.topGrowthMetric}{" "}
                    {renderTrend(wrapSummary.topGrowthValue, (v) => `+${Math.round(v)}`)}
                  </p>
                </div>
                <div className={styles.wrapStat}>
                  <p className={styles.wrapStatLabel}>Total Nodes</p>
                  <p className={styles.wrapStatValue}>{wrapSummary.totalNodes}</p>
                </div>
                <div className={styles.wrapStat}>
                  <p className={styles.wrapStatLabel}>Simulated Days</p>
                  <p className={styles.wrapStatValue}>{wrapSummary.durationDays}</p>
                </div>
              </div>
              <div className={styles.wrapMoments}>
                <p className={styles.wrapStatLabel}>Story Highlights</p>
                <div className="mt-2 space-y-2">
                  {wrapSummary.topStoryMoments.slice(0, 4).map((moment) => (
                    <p key={`${moment.seq}-${moment.label}`} className="text-sm text-zinc-100/90">
                      <span className={styles.wrapMomentBadge}>N{moment.seq}</span>
                      {moment.label}: {moment.story}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {error ? <div className={styles.errorBar}>{error}</div> : null}
        </div >
        <Dialog open={Boolean(selectedMetric)} onOpenChange={(open) => (!open ? setSelectedMetric(null) : null)}>
          <DialogContent className={`max-w-2xl ${styles.dialogFrame}`}>
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${styles.dialogTitle}`}>
                <BarChart3 className="h-5 w-5 text-white" />
                {activeMetricConfig?.label ?? "Metric details"}
              </DialogTitle>
              <DialogDescription className={styles.dialogSubtitle}>
                {activeMetricConfig?.detail}
              </DialogDescription>
            </DialogHeader>

            <div className={styles.dialogStatsGrid}>
              <div className={styles.dialogStat}>
                <p className={styles.dialogStatLabel}>Current</p>
                <p className={`${styles.dialogStatValue} ${scoreColor(activeMetricCurrent)}`}>
                  {activeMetricConfig?.format(activeMetricCurrent)}
                </p>
              </div>
              <div className={styles.dialogStat}>
                <p className={styles.dialogStatLabel}>Baseline</p>
                <p className={styles.dialogStatValue}>
                  {activeMetricConfig?.format(activeMetricBaseline)}
                </p>
              </div>
              <div className={styles.dialogStat}>
                <p className={styles.dialogStatLabel}>Change</p>
                <div className={styles.dialogStatValue}>
                  {renderTrend(activeMetricDelta, () =>
                    selectedMetric ? formatMetricDelta(selectedMetric, activeMetricDelta) : String(Math.round(activeMetricDelta))
                  )}
                </div>
              </div>
            </div>

            <div className={styles.dialogTrendBox}>
              <p className={styles.dialogTrendHeader}>
                <Clock3 className="h-4 w-4" />
                Timeline Trend
              </p>
              <div className={styles.dialogBars}>
                {activeMetricSeries.map((point, index) => {
                  const maxPoint = Math.max(...activeMetricSeries, 1);
                  const barHeight = Math.max(8, Math.round((point / maxPoint) * 100));
                  return (
                    <div
                      key={`${point}-${index}`}
                      className={styles.dialogBar}
                      style={{ height: `${barHeight}%` }}
                      title={`Point ${index + 1}: ${Math.round(point)}`}
                    />
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      {actionLoading ? (
        <div className={styles.actionLoaderOverlay} role="status" aria-live="polite" aria-label="Processing choice">
          <div className={styles.actionLoaderCard}>
            <div className={styles.actionLoaderCup} aria-hidden>
              <div className={styles.actionLoaderTea} />
              <div className={styles.actionLoaderSteam}>
                <span />
                <span />
                <span />
              </div>
            </div>
            <p className={styles.actionLoaderLabel}>{actionLoadingPhrases[loadingPhraseIndex]}</p>
            <div className={styles.actionLoaderDots} aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ) : null}
      {showOnboardingTransition ? (
        <div
          className={`${styles.onboardingTransitionOverlay} ${fadeOutTransition ? styles.onboardingTransitionFadeOut : ""
            }`}
          aria-hidden
        >
          <Image
            src="/cloudy_transition.gif"
            alt=""
            fill
            unoptimized
            priority
            sizes="100vw"
            className={styles.onboardingTransitionGif}
          />
        </div>
      ) : null}

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="max-w-2xl bg-[#000] border-white/10 p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,1)]">
          <div className="p-10 flex flex-col items-center text-center">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter text-white">
                Simulation Archived
              </DialogTitle>
              <DialogDescription className="text-white/50 text-base font-medium">
                Your future self has been recorded. Grab your summary and start the next chapter.
              </DialogDescription>
            </DialogHeader>

            {wrapSummary && (
              <div className="w-full flex flex-col items-center gap-8">
                {/* Wrapped Preview Box */}
                <div className="relative aspect-[1080/1350] w-[280px] bg-[#050505] border border-white/10 overflow-hidden shadow-2xl group">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-500 group-hover:scale-110">
                    <Suspense fallback={<ClassicLoader size="sm" />}>
                      <div className="scale-[0.25] origin-center opacity-90">
                        <div dangerouslySetInnerHTML={{
                          __html: `
                          <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="background-color: #000;">
                            <rect width="1080" height="1350" fill="#000000"/>
                            <g transform="translate(340, 150) scale(2.8)">
                              <image href="/sprite-parts/clothes/${(() => {
                              const avatar = asAvatar(setup);
                              return avatar.spriteId.split("|").find(s => s.startsWith("outfit:"))?.split(":")[1] || "blue-guard";
                            })()}.png" x="15" y="65" width="110" height="60" style="image-rendering: pixelated;"/>
                              <image href="/sprite-parts/head/${(() => {
                              const avatar = asAvatar(setup);
                              return avatar.spriteId.split("|").find(s => s.startsWith("head:"))?.split(":")[1] || "beige";
                            })()}.png" x="14" y="6" width="112" height="72" style="image-rendering: pixelated;"/>
                              <image href="/sprite-parts/hair/front/${(() => {
                              const avatar = asAvatar(setup);
                              return avatar.spriteId.split("|").find(s => s.startsWith("hair:"))?.split(":")[1] || "short-brown";
                            })()}.png" x="20" y="-1" width="100" height="58" style="image-rendering: pixelated;"/>
                            </g>
                            <text x="540" y="580" fill="#ffffff" font-size="64" font-family="monospace" font-weight="900" text-anchor="middle" style="text-transform: uppercase;">${cleanText(wrapSummary.title, 24)}</text>
                            <text x="540" y="640" fill="#444444" font-size="28" font-family="monospace" text-anchor="middle" letter-spacing="4">THE ORACLE WRAPPED</text>
                            <g transform="translate(100, 850)">
                              <text y="60" fill="#4ade80" font-size="42" font-family="monospace" font-weight="900">Career: ${Math.round(wrapSummary.finalMetrics.career)}</text>
                              <text y="120" fill="#fbbf24" font-size="42" font-family="monospace" font-weight="900">Salary: $${Math.round(wrapSummary.finalMetrics.salary).toLocaleString()}</text>
                              <text y="180" fill="#f87171" font-size="42" font-family="monospace" font-weight="900">Health: ${Math.round(wrapSummary.finalMetrics.health)}</text>
                            </g>
                          </svg>`.trim()
                        }} />
                      </div>
                    </Suspense>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center p-4">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-black">Official Oracle Archive</p>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-3">
                  <Button
                    onClick={() => void downloadWrapGraphic()}
                    disabled={endingSimulation}
                    className="h-14 w-full bg-white text-black hover:bg-white/90 rounded-none font-black uppercase tracking-tighter text-lg transition-all active:scale-[0.98]"
                  >
                    {endingSimulation ? <ClassicLoader size="sm" /> : (
                      <>
                        <Download className="mr-3 h-5 w-5" />
                        Download PNG
                      </>
                    )}
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    className="h-12 w-full text-white/40 hover:text-white hover:bg-white/5 rounded-none font-bold uppercase tracking-widest text-xs transition-all"
                  >
                    <Link href="/dashboard/all">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create New Simulation
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TutorialModal
        open={showTutorial}
        onOpenChange={setShowTutorial}
        setup={setup}
        onComplete={(newSetup) => {
          if (newSetup) setSetup(newSetup);
          setShowTutorial(false);
        }}
      />

      <SpriteEditModal
        isOpen={isSpriteEditModalOpen}
        onClose={() => setIsSpriteEditModalOpen(false)}
        setup={setup}
        onSetupUpdate={(updatedSetup) => setSetup(updatedSetup)}
      />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className={styles.loadingShell}><ClassicLoader /></main>}>
      <DashboardContent />
    </Suspense>
  );
}
