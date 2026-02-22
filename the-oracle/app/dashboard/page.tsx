"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Download,
  Flag,
  PlusCircle,
  Settings,
  Share2,
  Sparkles,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { hydrateLocalSimulationStateFromSupabase } from "@/lib/client/cloud-state";
import { loadSetup } from "@/lib/client/setup-store";
import { PixelAvatar } from "@/components/shared/pixel-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ClassicLoader from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
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
      key: "money",
      label: "Money",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Represents financial flexibility and day-to-day confidence with money decisions.",
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
      key: "relationships",
      label: "Relationships",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Measures relationship quality, support depth, and social consistency.",
    },
    {
      key: "fulfillment",
      label: "Fulfillment",
      format: (value) => `${Math.round(value)}/100`,
      detail: "How aligned your daily decisions are with meaning and personal priorities.",
    },
    {
      key: "stress",
      label: "Stress",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Higher values indicate sustained pressure and lower buffer capacity.",
    },
    {
      key: "freeTime",
      label: "Free Time",
      format: (value) => `${Math.round(value)}/100`,
      detail: "Available breathing room for recovery, relationships, and exploration.",
    },
  ];

const createDefaults = {
  mode: "manual_step" as SimulationMode,
  horizonPreset: "10_years" as SimulationHorizonPreset,
};

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

function metricValue(
  metrics: SimulationMetrics | undefined,
  key: keyof SimulationMetrics,
) {
  if (!metrics) return 0;
  const value = metrics[key];
  return Number.isFinite(value) ? value : 0;
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

export default function DashboardPage() {
  const [setup, setSetup] = useState<UserSetup | null>(() => {
    if (typeof window === "undefined") return null;
    return loadSetup();
  });
  const [simulations, setSimulations] = useState<SimulationRun[]>([]);
  const [activeRun, setActiveRun] = useState<SimulationRun | null>(null);
  const [nodes, setNodes] = useState<SimulationNode[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<keyof SimulationMetrics | null>(null);
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

  const avatar = useMemo(() => asAvatar(setup), [setup]);
  const latestNode = nodes[nodes.length - 1] ?? null;
  const latestNodeId = latestNode?.id ?? null;
  const focusedNode = useMemo(
    () => (focusedNodeId ? nodes.find((node) => node.id === focusedNodeId) ?? latestNode : latestNode),
    [focusedNodeId, latestNode, nodes],
  );
  const runMetrics = latestNode?.metricsSnapshot ?? activeRun?.latestMetrics;
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

  useEffect(() => {
    void bootDashboard();
  }, [bootDashboard]);

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
    async (option?: SimulationActionOption) => {
      if (!activeRun) return;
      if (activeRun.mode !== "manual_step") return;
      if (activeRun.status !== "active") return;

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
        if (!option) {
          setCustomAction("");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unable to apply simulation step.");
      } finally {
        setActionLoading(false);
      }
    },
    [activeRun, customAction],
  );

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
      const refreshed = await authFetch<SimulationListResponse>("/api/simulation?limit=50");
      setSimulations(refreshed.simulations ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to end simulation.");
    } finally {
      setEndingSimulation(false);
    }
  }, [activeRun, endingSimulation]);

  const shareWrap = useCallback(async () => {
    if (!wrapSummary || !activeRun) return;
    const text = [
      `The Oracle Wrapped: ${wrapSummary.title}`,
      `Mode: ${wrapSummary.mode === "auto_future" ? "Time Into The Future" : "Manual Story Mode"}`,
      `Timeline nodes: ${wrapSummary.totalNodes}`,
      `Top growth metric: ${wrapSummary.topGrowthMetric} (+${wrapSummary.topGrowthValue})`,
      wrapSummary.summaryParagraph,
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${activeRun.title} - Oracle Wrapped`,
          text,
        });
        return;
      }
      await navigator.clipboard.writeText(text);
      setError("Wrapped summary copied to clipboard.");
    } catch {
      setError("Unable to share this summary on your current device.");
    }
  }, [activeRun, wrapSummary]);

  const downloadWrapGraphic = useCallback(() => {
    if (!wrapSummary || !activeRun) return;
    const topMoments = wrapSummary.topStoryMoments
      .slice(0, 3)
      .map((moment, index) =>
        `${index + 1}. N${moment.seq} ${cleanText(moment.label, 46)}`
      );
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#321354"/>
      <stop offset="100%" stop-color="#081b36"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6ee7f9"/>
      <stop offset="100%" stop-color="#f8b4fe"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect x="64" y="64" width="952" height="1222" rx="40" fill="rgba(5,10,23,0.58)" stroke="rgba(255,255,255,0.22)"/>
  <text x="100" y="150" fill="#d1fae5" font-size="26" font-family="Georgia">THE ORACLE WRAPPED</text>
  <text x="100" y="218" fill="#ffffff" font-size="56" font-family="Georgia" font-weight="700">${cleanText(wrapSummary.title, 32)}</text>
  <text x="100" y="268" fill="#bfdbfe" font-size="24" font-family="Georgia">${activeRun.mode === "auto_future" ? "Time Into The Future" : "Manual Story Mode"}</text>

  <rect x="100" y="320" width="880" height="180" rx="24" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)"/>
  <text x="130" y="378" fill="#f9fafb" font-size="34" font-family="Georgia">Top Growth: ${cleanText(wrapSummary.topGrowthMetric, 20)} (+${wrapSummary.topGrowthValue})</text>
  <text x="130" y="430" fill="#bae6fd" font-size="24" font-family="Georgia">Timeline nodes: ${wrapSummary.totalNodes} • Simulated days: ${wrapSummary.durationDays}</text>

  <text x="100" y="568" fill="#f0f9ff" font-size="30" font-family="Georgia">Story Highlights</text>
  <text x="120" y="624" fill="#e2e8f0" font-size="22" font-family="Georgia">${cleanText(topMoments[0] ?? "-", 70)}</text>
  <text x="120" y="668" fill="#e2e8f0" font-size="22" font-family="Georgia">${cleanText(topMoments[1] ?? "-", 70)}</text>
  <text x="120" y="712" fill="#e2e8f0" font-size="22" font-family="Georgia">${cleanText(topMoments[2] ?? "-", 70)}</text>

  <rect x="100" y="770" width="880" height="390" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)"/>
  <text x="130" y="830" fill="#f9fafb" font-size="28" font-family="Georgia">Final Metrics</text>
  <text x="130" y="884" fill="#dbeafe" font-size="22" font-family="Georgia">Money: ${Math.round(wrapSummary.finalMetrics.money)}/100</text>
  <text x="130" y="924" fill="#dbeafe" font-size="22" font-family="Georgia">Career: ${Math.round(wrapSummary.finalMetrics.career)}/100</text>
  <text x="130" y="964" fill="#dbeafe" font-size="22" font-family="Georgia">Health: ${Math.round(wrapSummary.finalMetrics.health)}/100</text>
  <text x="130" y="1004" fill="#dbeafe" font-size="22" font-family="Georgia">Relationships: ${Math.round(wrapSummary.finalMetrics.relationships)}/100</text>
  <text x="130" y="1044" fill="#dbeafe" font-size="22" font-family="Georgia">Net Worth: $${Math.round(wrapSummary.finalMetrics.netWorth).toLocaleString()}</text>
  <text x="130" y="1084" fill="#dbeafe" font-size="22" font-family="Georgia">Salary: $${Math.round(wrapSummary.finalMetrics.salary).toLocaleString()}</text>

  <rect x="100" y="1198" width="880" height="12" rx="6" fill="url(#accent)"/>
  <text x="100" y="1260" fill="#cbd5e1" font-size="22" font-family="Georgia">${cleanText(wrapSummary.summaryParagraph, 92)}</text>
</svg>`.trim();

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeRun.title.replace(/\s+/g, "-").toLowerCase()}-wrapped.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [activeRun, wrapSummary]);

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
      <main className={`${styles.page} ${showOnboardingTransition ? styles.pageHidden : ""}`}>
        <div className={styles.shell}>
          {activeRun ? (
            <div className={styles.frameShell}>
              <div className={styles.mainGrid}>
                <section className={styles.leftColumn}>
                  <div className={styles.timelinePanel}>
                    <div className={styles.timelineTopRow}>
                      <p className={styles.timelineLabel}>Timeline</p>
                      <div className={styles.compactControls}>
                        <select
                          aria-label="Current simulation"
                          value={activeRun?.id ?? ""}
                          onChange={(event) => void selectSimulation(event.target.value)}
                          className={styles.compactSelect}
                        >
                          {(simulations ?? []).map((simulation) => (
                            <option key={simulation.id} value={simulation.id}>
                              {simulation.title}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="New simulation mode"
                          value={createMode}
                          onChange={(event) => setCreateMode(event.target.value as SimulationMode)}
                          className={styles.compactMiniSelect}
                        >
                          <option value="manual_step">Manual</option>
                          <option value="auto_future">Auto</option>
                        </select>
                        <select
                          aria-label="New simulation horizon"
                          value={createHorizonPreset}
                          onChange={(event) => setCreateHorizonPreset(event.target.value as SimulationHorizonPreset)}
                          className={styles.compactMiniSelect}
                        >
                          <option value="1_week">1w</option>
                          <option value="1_year">1y</option>
                          <option value="10_years">10y</option>
                          <option value="whole_life">Life</option>
                        </select>
                        <Button
                          type="button"
                          onClick={() => void createSimulation()}
                          disabled={creatingSimulation}
                          className={styles.compactButton}
                        >
                          <PlusCircle className="h-4 w-4" />
                          {creatingSimulation ? <ClassicLoader size="sm" /> : "New"}
                        </Button>
                      </div>
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

                  <div className={styles.stagePanel}>
                    <div className={styles.avatarArea}>
                      <div className={styles.avatarContainer}>
                        <PixelAvatar avatar={avatar} size={230} />
                      </div>
                      <div className={styles.bubbleContainer}>
                        <p className={styles.bubbleTitle}>Story + changelog</p>
                        <p className={styles.bubbleBody}>{headlineStory}</p>
                        <div className={styles.changeList}>
                          {changelog.length > 0 ? (
                            changelog.map((entry, index) => (
                              <p key={`${entry}-${index}`}>• {entry}</p>
                            ))
                          ) : (
                            <p>No metric change logged on this node.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.optionsArea}>
                      {activeRun.mode === "manual_step" && activeRun.status === "active" ? (
                        <div className={styles.optionsGrid}>
                          {manualOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => void performStep(option)}
                              disabled={actionLoading}
                              className={styles.optionCard}
                            >
                              <p className={styles.optionCardTitle}>{option.title}</p>
                              <p className={styles.optionCardDesc}>{option.description}</p>
                              <p className={styles.optionCardHint}>{option.impactHint}</p>
                            </button>
                          ))}
                          <div className={styles.customOptionCard}>
                            <p className={styles.customTitle}>Custom (manual)</p>
                            <Textarea
                              value={customAction}
                              onChange={(event) => setCustomAction(event.target.value)}
                              placeholder="Define your own next action..."
                              className={styles.customInput}
                            />
                            <div className="mt-2 flex justify-end">
                              <Button
                                type="button"
                                onClick={() => void performStep()}
                                disabled={actionLoading || !cleanText(customAction, 220)}
                                className={styles.customRunButton}
                              >
                                {actionLoading ? <ClassicLoader size="sm" /> : "Run"}
                              </Button>
                            </div>
                          </div>
                        </div>
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

                <aside className={styles.statsPanel}>
                  <div className={styles.statsHeader}>
                    <p className={styles.statsTitle}>Stats</p>
                    <div className={styles.statsActions}>
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
                      const sign = delta >= 0 ? "+" : "";
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
                            {sign}
                            {metric.key === "netWorth" || metric.key === "salary" || metric.key === "monthlyExpenses"
                              ? `$${Math.round(delta).toLocaleString()}`
                              : Math.round(delta)}
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
              <p>No simulation found yet. Create one to begin.</p>
              <div className={styles.emptyControls}>
                <select
                  aria-label="New simulation mode"
                  value={createMode}
                  onChange={(event) => setCreateMode(event.target.value as SimulationMode)}
                  className={styles.compactMiniSelect}
                >
                  <option value="manual_step">Manual</option>
                  <option value="auto_future">Auto</option>
                </select>
                <select
                  aria-label="New simulation horizon"
                  value={createHorizonPreset}
                  onChange={(event) => setCreateHorizonPreset(event.target.value as SimulationHorizonPreset)}
                  className={styles.compactMiniSelect}
                >
                  <option value="1_week">1w</option>
                  <option value="1_year">1y</option>
                  <option value="10_years">10y</option>
                  <option value="whole_life">Life</option>
                </select>
                <Button
                  type="button"
                  onClick={() => void createSimulation()}
                  disabled={creatingSimulation}
                  className={styles.compactButton}
                >
                  <PlusCircle className="h-4 w-4" />
                  {creatingSimulation ? <ClassicLoader size="sm" /> : "Create Simulation"}
                </Button>
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
                <Button type="button" onClick={() => void shareWrap()} className={styles.wrapShare}>
                  <Share2 className="mr-1 h-4 w-4" />
                  Share Wrapped
                </Button>
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
                    {wrapSummary.topGrowthMetric} (+{wrapSummary.topGrowthValue})
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
                <p className={`${styles.dialogStatValue} ${activeMetricDelta >= 0 ? "text-white" : "text-gray-400"}`}>
                  {activeMetricDelta >= 0 ? "+" : ""}
                  {selectedMetric === "netWorth" || selectedMetric === "salary" || selectedMetric === "monthlyExpenses"
                    ? `$${Math.round(activeMetricDelta).toLocaleString()}`
                    : Math.round(activeMetricDelta)}
                </p>
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
