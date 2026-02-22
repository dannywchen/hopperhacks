import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { horizonPresetToYears } from "@/lib/onboarding/config";
import { buildAIMemoryContext, loadUserSetup } from "@/lib/game-db";
import { deterministicTransition } from "@/lib/simulation-deterministic";
import type {
  OnboardingSnapshot,
  SimulationActionOption,
  SimulationActionType,
  SimulationHorizonPreset,
  SimulationMetrics,
  SimulationMode,
  SimulationNode,
  SimulationRun,
  UserSetup,
} from "@/lib/types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3-flash-preview";

const metricKeys: Array<keyof SimulationMetrics> = [
  "projectedDeathDate",
  "netWorth",
  "salary",
  "relationships",
  "freeTime",
  "career",
  "health",
  "stress",
  "fulfillment",
  "monthlyExpenses",
  "confidence",
];

const runStatusSchema = z.enum(["active", "ended"]);
const simulationModeSchema = z.enum(["auto_future", "manual_step"]);
const horizonPresetSchema = z.enum(["whole_life", "10_years", "1_year", "1_week"]);

const simulationMetricsSchema: z.ZodType<SimulationMetrics> = z.object({
  health: z.number().catch(50),
  career: z.number().catch(50),
  relationships: z.number().catch(20),
  fulfillment: z.number().catch(50),
  stress: z.number().catch(50),
  freeTime: z.number().catch(28),
  netWorth: z.number().catch(15000),
  salary: z.number().catch(60000),
  monthlyExpenses: z.number().catch(3000),
  confidence: z.number().catch(50),
  projectedDeathDate: z.number().catch(() => new Date(new Date().getFullYear() + 60, 5, 15).getTime()),
});

const simulationActionOptionSchema: z.ZodType<SimulationActionOption> = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  impactHint: z.string(),
  metricBias: z.record(z.string(), z.number()).optional(),
});

const simulationNodeSchema: z.ZodType<SimulationNode> = z.object({
  id: z.string(),
  simulationId: z.string(),
  profileId: z.string(),
  seq: z.number(),
  simulatedDate: z.string(),
  actionType: z.enum(["auto_projection", "manual_predefined", "manual_custom", "system"]),
  actionLabel: z.string(),
  actionDetails: z.string().nullable().optional(),
  story: z.string(),
  changelog: z.array(z.string()),
  metricDeltas: z.record(z.string(), z.number()),
  metricsSnapshot: simulationMetricsSchema,
  nextOptions: z.array(simulationActionOptionSchema),
  createdAt: z.string(),
});

const simulationRunSchema: z.ZodType<SimulationRun> = z.object({
  id: z.string(),
  profileId: z.string(),
  title: z.string(),
  mode: simulationModeSchema,
  horizonPreset: horizonPresetSchema,
  status: runStatusSchema,
  currentDay: z.number(),
  startedAt: z.string(),
  endedAt: z.string().nullable().optional(),
  baselineMetrics: simulationMetricsSchema,
  latestMetrics: simulationMetricsSchema,
  summary: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const autoTrajectorySchema = z.object({
  tone: z.string().min(4).max(120),
  themes: z.array(z.string().min(2).max(80)).min(2).max(6),
  recurringActions: z
    .array(
      z.object({
        title: z.string().min(4).max(80),
        description: z.string().min(6).max(220),
      }),
    )
    .min(3)
    .max(8),
  milestones: z
    .array(
      z.object({
        offset: z.number().int().min(1).max(360),
        title: z.string().min(4).max(90),
        story: z.string().min(10).max(240),
      }),
    )
    .max(24),
});

const manualStepOutcomeSchema = z.object({
  actionLabel: z.string().min(4).max(90),
  story: z.string().min(16).max(700),
});

type CreateSimulationInput = {
  title?: string | null;
  mode: SimulationMode;
  horizonPreset: SimulationHorizonPreset;
  targetOutcome?: string | null;
  setup?: UserSetup | null;
  onboarding?: OnboardingSnapshot | null;
};

type RunRow = {
  id: string;
  profile_id: string;
  title: string;
  mode: SimulationMode;
  horizon_preset: SimulationHorizonPreset;
  status: "active" | "ended";
  current_day: number;
  started_at: string;
  ended_at: string | null;
  baseline_metrics: unknown;
  latest_metrics: unknown;
  summary: unknown;
  created_at: string;
  updated_at: string;
};

type NodeRow = {
  id: string;
  simulation_id: string;
  profile_id: string;
  seq: number;
  simulated_date: string;
  action_type: SimulationActionType;
  action_label: string;
  action_details: string | null;
  story: string;
  changelog: unknown;
  metric_deltas: unknown;
  metrics_snapshot: unknown;
  next_options: unknown;
  created_at: string;
};

function cleanText(value: unknown, max = 700): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampMetricValue(key: keyof SimulationMetrics, value: number): number {
  if (key === "netWorth") return clamp(Math.round(value), -500_000_000, 5_000_000_000);
  if (key === "salary") return clamp(Math.round(value), 0, 2_000_000);
  if (key === "monthlyExpenses") return clamp(Math.round(value), 0, 1_000_000);
  return clamp(Math.round(value), 0, 100);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => cleanText(entry, 200)).filter(Boolean);
}

function normalizeMetricPatch(
  input: Record<string, unknown> | Partial<SimulationMetrics> | undefined,
): Partial<SimulationMetrics> {
  if (!input || typeof input !== "object") return {};
  const patch: Partial<SimulationMetrics> = {};
  for (const key of metricKeys) {
    const raw = (input as Record<string, unknown>)[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      patch[key] = raw;
    }
  }
  return patch;
}

function parseRunRow(row: RunRow): SimulationRun {
  const parsed = {
    id: row.id,
    profileId: row.profile_id,
    title: cleanText(row.title, 120) || "Untitled Simulation",
    mode: row.mode,
    horizonPreset: row.horizon_preset,
    status: row.status,
    currentDay: Number.isFinite(row.current_day) ? row.current_day : 0,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    baselineMetrics: simulationMetricsSchema.parse(row.baseline_metrics),
    latestMetrics: simulationMetricsSchema.parse(row.latest_metrics),
    summary: parseJsonObject(row.summary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return simulationRunSchema.parse(parsed);
}

function parseNodeRow(row: NodeRow): SimulationNode {
  const parsed = {
    id: row.id,
    simulationId: row.simulation_id,
    profileId: row.profile_id,
    seq: Number.isFinite(row.seq) ? row.seq : 0,
    simulatedDate: row.simulated_date,
    actionType: row.action_type,
    actionLabel: cleanText(row.action_label, 110),
    actionDetails: row.action_details ? cleanText(row.action_details, 240) : null,
    story: cleanText(row.story, 1800),
    changelog: parseStringList(row.changelog),
    metricDeltas: normalizeMetricPatch(parseJsonObject(row.metric_deltas)),
    metricsSnapshot: simulationMetricsSchema.parse(row.metrics_snapshot),
    nextOptions: Array.isArray(row.next_options)
      ? row.next_options
        .map((entry) => simulationActionOptionSchema.safeParse(entry))
        .filter((entry) => entry.success)
        .map((entry) => entry.data)
        .slice(0, 3)
      : [],
    createdAt: row.created_at,
  };
  return simulationNodeSchema.parse(parsed);
}

function factorValue(setup: UserSetup | null, id: string, fallback: number): number {
  const factor = setup?.factors?.find((item) => item.id === id);
  const value = typeof factor?.baseline?.value === "number" ? factor.baseline.value : fallback;
  return clamp(value, 0, 100);
}

function setupFromOnboarding(
  onboarding: OnboardingSnapshot | null | undefined,
  setup: UserSetup | null | undefined,
) {
  return {
    name: cleanText(setup?.profile?.name ?? onboarding?.linkedinProfile?.fullName ?? "Player", 80),
    occupation: cleanText(setup?.profile?.occupation ?? onboarding?.linkedinProfile?.headline ?? "Builder", 120),
    lifeStory: cleanText(onboarding?.lifeStory, 1200),
    targetOutcome: cleanText(onboarding?.targetOutcome, 700),
  };
}

export function buildDefaultMetricsFromSetup(setup: UserSetup | null): SimulationMetrics {
  const health = factorValue(setup, "health", 55);
  const money = factorValue(setup, "money", 50);
  const career = factorValue(setup, "career", 50);
  const fulfillment = factorValue(setup, "fulfillment", 51);
  const netWorthRaw = setup?.factors?.find((item) => item.id === "netWorthTotal")?.baseline?.value;
  const netWorth = clampMetricValue("netWorth", typeof netWorthRaw === "number" ? netWorthRaw : 15_000);
  const salary = clampMetricValue("salary", Math.max(28_000, Math.round(26_000 + money * 1_150)));
  const monthlyExpenses = clampMetricValue("monthlyExpenses", Math.round((salary * 0.58) / 12));

  const age = setup?.profile?.age ?? 25;
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - age;
  // Assume an average lifespan of 82 years right now
  const projectedDeathYear = birthYear + 82;
  const projectedDeathDate = new Date(projectedDeathYear, 5, 15).getTime(); // roughly mid-year

  return {
    health,
    career,
    relationships: 14, // 14 hours / week
    fulfillment,
    stress: clampMetricValue("stress", 62 - health * 0.22),
    freeTime: 28, // 28 hours / week
    netWorth,
    salary,
    monthlyExpenses,
    confidence: clampMetricValue("confidence", 40 + (setup?.onboarding?.reflections?.length ?? 0) * 5),
    projectedDeathDate,
  };
}

function horizonProfile(preset: SimulationHorizonPreset): {
  nodeCount: number;
  dayIncrement: number;
} {
  if (preset === "1_week") {
    return { nodeCount: 7, dayIncrement: 1 };
  }
  if (preset === "1_year") {
    return { nodeCount: 52, dayIncrement: 7 };
  }
  if (preset === "whole_life") {
    return { nodeCount: 180, dayIncrement: 120 };
  }
  return { nodeCount: 120, dayIncrement: 30 };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}

async function requestGeminiJson<T>(params: {
  prompt: string;
  schema: z.ZodSchema<T>;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.35,
          maxOutputTokens: params.maxOutputTokens ?? 1_400,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as
    | {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
    | null;
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? "").join("").trim();
  if (!text) return null;

  try {
    const candidate = JSON.parse(extractJson(text)) as unknown;
    const parsed = params.schema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function generateAutoTrajectoryPlan(params: {
  profileDigest: string;
  memoryDigest: string;
  baselineMetrics: SimulationMetrics;
  modeTitle: string;
  horizonPreset: SimulationHorizonPreset;
  targetOutcome: string;
  nodeCount: number;
}) {
  const prompt = [
    "You are planning a future life simulation trajectory.",
    "Return strict JSON only.",
    "Do not include numeric metric deltas. Metrics are computed by a deterministic backend model.",
    `Mode: ${params.modeTitle}`,
    `Horizon preset: ${params.horizonPreset}`,
    `Requested timeline nodes: ${params.nodeCount}`,
    `Profile: ${params.profileDigest}`,
    `Memory context: ${params.memoryDigest || "none"}`,
    `Target outcome: ${params.targetOutcome || "none"}`,
    `Baseline metrics: ${JSON.stringify(params.baselineMetrics)}`,
    "Respond with:",
    JSON.stringify(
      {
        tone: "one short phrase",
        themes: ["3-6 life themes"],
        recurringActions: [
          {
            title: "short title",
            description: "specific action pattern",
          },
        ],
        milestones: [
          {
            offset: 3,
            title: "milestone title",
            story: "short story sentence",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");

  return requestGeminiJson({
    prompt,
    schema: autoTrajectorySchema,
    maxOutputTokens: 2_200,
  });
}

function fallbackAutoPlan(targetOutcome: string) {
  const narrative = targetOutcome ? `while aiming for ${targetOutcome}` : "while balancing growth and wellbeing";
  return {
    tone: "ambitious but grounded",
    themes: ["career growth", "financial resilience", "relationship depth", "health routines"],
    recurringActions: [
      {
        title: "Execute focused weekly sprint",
        description: `You make clear weekly plans ${narrative}.`,
      },
      {
        title: "Invest in core relationships",
        description: "You schedule quality time and repair communication loops early.",
      },
      {
        title: "Protect health baseline",
        description: "You preserve sleep and movement to maintain compounding performance.",
      },
      {
        title: "Audit spending and reallocate",
        description: "You trim reactive spending and move money toward higher-leverage bets.",
      },
    ],
    milestones: [
      {
        offset: 4,
        title: "Breakthrough project",
        story: "A compounding project starts attracting external opportunities.",
      },
      {
        offset: 11,
        title: "Life admin reset",
        story: "You restructure routines after overload signals and recover momentum.",
      },
      {
        offset: 17,
        title: "Financial inflection",
        story: "A disciplined streak meaningfully raises your net worth slope.",
      },
    ],
  };
}

function buildAutoProjectionNodes(params: {
  simulationId: string;
  profileId: string;
  mode: SimulationMode;
  horizonPreset: SimulationHorizonPreset;
  baselineMetrics: SimulationMetrics;
  startDate: Date;
  plan: z.infer<typeof autoTrajectorySchema>;
}): Array<Omit<NodeRow, "id" | "created_at">> {
  const { nodeCount, dayIncrement } = horizonProfile(params.horizonPreset);
  const nodes: Array<Omit<NodeRow, "id" | "created_at">> = [];
  let current = { ...params.baselineMetrics };
  const milestonesByOffset = new Map(params.plan.milestones.map((item) => [item.offset, item]));

  nodes.push({
    simulation_id: params.simulationId,
    profile_id: params.profileId,
    seq: 0,
    simulated_date: params.startDate.toISOString().slice(0, 10),
    action_type: "system",
    action_label: "Simulation starts",
    action_details: params.mode === "auto_future" ? "Auto future projection initialized." : "Manual simulation initialized.",
    story: `The simulation begins with a ${params.plan.tone} trajectory focused on ${params.plan.themes.slice(0, 3).join(", ")}.`,
    changelog: [],
    metric_deltas: {},
    metrics_snapshot: current,
    next_options: [],
  });

  for (let index = 1; index <= nodeCount; index += 1) {
    const baseAction = params.plan.recurringActions[(index - 1) % params.plan.recurringActions.length];
    const milestone = milestonesByOffset.get(index);
    const actionLabel = cleanText(milestone?.title ?? baseAction.title, 100);
    const actionDetails = cleanText(milestone?.story ?? baseAction.description, 240);
    const transition = deterministicTransition({
      currentMetrics: current,
      actionLabel,
      actionDetails,
      days: dayIncrement,
    });
    const adjustedDeltas = transition.metricDeltas;
    const nextMetrics = transition.nextMetrics;
    const metricLines = transition.changelog;

    const pointInTime = new Date(params.startDate);
    pointInTime.setUTCDate(pointInTime.getUTCDate() + dayIncrement * index);
    const storyLead = milestone
      ? `Milestone: ${cleanText(milestone.story, 280)}`
      : `${actionDetails} This keeps compounding over time.`;
    const story = `${storyLead} The simulated trajectory remains ${params.plan.tone}.`;

    nodes.push({
      simulation_id: params.simulationId,
      profile_id: params.profileId,
      seq: index,
      simulated_date: pointInTime.toISOString().slice(0, 10),
      action_type: "auto_projection",
      action_label: actionLabel || "Auto progression",
      action_details: actionDetails || null,
      story: cleanText(story, 1200),
      changelog: metricLines,
      metric_deltas: adjustedDeltas,
      metrics_snapshot: nextMetrics,
      next_options: [],
    });

    current = nextMetrics;
  }

  return nodes;
}

type ManualOptionDraft = {
  id?: string;
  title: string;
  description: string;
  impactHint?: string;
};

function fallbackManualOptionDrafts(metrics: SimulationMetrics): ManualOptionDraft[] {
  const options: ManualOptionDraft[] = [
    {
      id: crypto.randomUUID(),
      title: "Push on career initiative",
      description: "Take a concrete step that could accelerate your career this week.",
    },
    {
      id: crypto.randomUUID(),
      title: "Prioritize health and rhythm",
      description: "Protect sleep, movement, and recovery, even if output dips short term.",
    },
    {
      id: crypto.randomUUID(),
      title: "Strengthen relationships",
      description: "Invest in one key relationship and remove unresolved tension.",
    },
  ];
  if (metrics.netWorth < 10000 && metrics.salary < 50000) {
    options[0] = {
      id: crypto.randomUUID(),
      title: "Run a financial reset",
      description: "Tighten recurring spending and move cash toward a clear savings plan.",
    };
  }
  return options;
}

function finalizeManualOptions(
  drafts: ManualOptionDraft[],
  metrics: SimulationMetrics,
): SimulationActionOption[] {
  const normalized = drafts
    .slice(0, 3)
    .map((draft) => {
      const title = cleanText(draft.title, 90);
      const description = cleanText(draft.description, 220);
      if (!title || !description) return null;
      const preview = deterministicTransition({
        currentMetrics: metrics,
        actionLabel: title,
        actionDetails: description,
        days: 1,
      });
      return {
        id: draft.id || crypto.randomUUID(),
        title,
        description,
        impactHint: cleanText(draft.impactHint, 140) || preview.impactHint,
        metricBias: normalizeMetricPatch(preview.metricDeltas),
      } satisfies SimulationActionOption;
    })
    .filter((option): option is NonNullable<typeof option> => option !== null);

  if (normalized.length === 3) return normalized;
  const fallbacks = fallbackManualOptionDrafts(metrics);
  const filled = [...normalized];
  for (const fallback of fallbacks) {
    if (filled.length >= 3) break;
    const preview = deterministicTransition({
      currentMetrics: metrics,
      actionLabel: fallback.title,
      actionDetails: fallback.description,
      days: 1,
    });
    filled.push({
      id: fallback.id || crypto.randomUUID(),
      title: cleanText(fallback.title, 90),
      description: cleanText(fallback.description, 220),
      impactHint: preview.impactHint,
      metricBias: normalizeMetricPatch(preview.metricDeltas),
    });
  }
  return filled.slice(0, 3);
}

function fallbackManualOptions(metrics: SimulationMetrics): SimulationActionOption[] {
  return finalizeManualOptions(fallbackManualOptionDrafts(metrics), metrics);
}

async function generateManualOptions(params: {
  profileDigest: string;
  memoryDigest: string;
  metrics: SimulationMetrics;
  latestStory: string;
}): Promise<SimulationActionOption[]> {
  const schema = z.object({
    options: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string(),
          description: z.string(),
          impactHint: z.string().optional(),
        }),
      )
      .length(3),
  });

  const prompt = [
    "You are generating the next 3 likely actions in a life simulation.",
    "Return JSON only.",
    `Profile: ${params.profileDigest}`,
    `Memory context: ${params.memoryDigest || "none"}`,
    `Latest story: ${params.latestStory || "simulation start"}`,
    `Current metrics: ${JSON.stringify(params.metrics)}`,
    "Each option must be concrete and realistic for the next day.",
    "Do not include numeric metric deltas.",
    JSON.stringify(
      {
        options: [
          {
            id: "uuid",
            title: "Short action",
            description: "What this action means in practice",
            impactHint: "Optional one-line impact summary",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");

  const response = await requestGeminiJson({
    prompt,
    schema,
    maxOutputTokens: 1_300,
  });
  if (!response) return fallbackManualOptions(params.metrics);
  return finalizeManualOptions(response.options, params.metrics);
}

function localManualOutcome(params: {
  selectedActionLabel: string;
  selectedActionDetails: string;
}) {
  return {
    actionLabel: params.selectedActionLabel,
    story: `${params.selectedActionDetails} The day unfolds with visible tradeoffs and compounding effects.`,
  };
}

async function generateManualOutcome(params: {
  profileDigest: string;
  memoryDigest: string;
  selectedActionLabel: string;
  selectedActionDetails: string;
  latestStory: string;
  latestMetrics: SimulationMetrics;
}): Promise<z.infer<typeof manualStepOutcomeSchema>> {
  const prompt = [
    "You are narrating the next day of a personal life simulation game.",
    "Return JSON only.",
    `Profile: ${params.profileDigest}`,
    `Memory context: ${params.memoryDigest || "none"}`,
    `Latest story: ${params.latestStory}`,
    `Current metrics: ${JSON.stringify(params.latestMetrics)}`,
    `Chosen action: ${params.selectedActionLabel}`,
    `Chosen action details: ${params.selectedActionDetails}`,
    "Write realistic outcomes. Do not invent numeric metric deltas.",
    JSON.stringify(
      {
        actionLabel: params.selectedActionLabel,
        story: "150-260 characters describing what happened next",
      },
      null,
      2,
    ),
  ].join("\n");

  const geminiOutcome = await requestGeminiJson({
    prompt,
    schema: manualStepOutcomeSchema,
    maxOutputTokens: 900,
  });
  if (geminiOutcome) {
    return {
      actionLabel: cleanText(geminiOutcome.actionLabel, 90),
      story: cleanText(geminiOutcome.story, 1_200),
    };
  }

  return localManualOutcome(params);
}

function buildProfileDigest(setup: UserSetup | null, onboarding: OnboardingSnapshot | null | undefined) {
  const profile = setupFromOnboarding(onboarding, setup);
  return [
    `Name: ${profile.name || "Player"}`,
    `Occupation: ${profile.occupation || "Unknown"}`,
    profile.targetOutcome ? `Target outcome: ${profile.targetOutcome}` : null,
    profile.lifeStory ? `Life story: ${profile.lifeStory}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function loadSetupAndMemory(profileId: string, explicitSetup?: UserSetup | null) {
  const persisted = explicitSetup
    ? { setup: explicitSetup }
    : await loadUserSetup(profileId).catch(() => ({ setup: null }));
  const setup = (persisted.setup ?? null) as UserSetup | null;
  const memoryDigest = await buildAIMemoryContext(profileId, 16).catch(() => "");
  return { setup, memoryDigest };
}

export async function listSimulations(profileId: string, limit = 20): Promise<SimulationRun[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_runs")
    .select("*")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) throw error;
  return (data ?? []).map((row: RunRow) => parseRunRow(row));
}

export async function getSimulationWithNodes(params: {
  profileId: string;
  simulationId: string;
  nodeLimit?: number;
}): Promise<{ run: SimulationRun; nodes: SimulationNode[] }> {
  const supabase = getSupabaseAdmin();
  const { data: runData, error: runError } = await supabase
    .from("simulation_runs")
    .select("*")
    .eq("id", params.simulationId)
    .eq("profile_id", params.profileId)
    .maybeSingle();
  if (runError) throw runError;
  if (!runData) {
    throw new Error("Simulation not found.");
  }

  const { data: nodeData, error: nodeError } = await supabase
    .from("simulation_nodes")
    .select("*")
    .eq("simulation_id", params.simulationId)
    .eq("profile_id", params.profileId)
    .order("seq", { ascending: true })
    .limit(Math.max(10, Math.min(params.nodeLimit ?? 400, 600)));
  if (nodeError) throw nodeError;

  return {
    run: parseRunRow(runData as RunRow),
    nodes: (nodeData ?? []).map((row: NodeRow) => parseNodeRow(row)),
  };
}

async function insertNodes(nodes: Array<Omit<NodeRow, "id" | "created_at">>) {
  const supabase = getSupabaseAdmin();
  if (nodes.length === 0) return;
  const chunkSize = 120;
  for (let i = 0; i < nodes.length; i += chunkSize) {
    const slice = nodes.slice(i, i + chunkSize);
    const { error } = await supabase.from("simulation_nodes").insert(slice);
    if (error) throw error;
  }
}

export async function createSimulation(params: {
  profileId: string;
  input: CreateSimulationInput;
}) {
  const title = cleanText(params.input.title, 100) || "New Simulation";
  const targetOutcome = cleanText(params.input.targetOutcome, 700);
  const mode = simulationModeSchema.parse(params.input.mode);
  const horizonPreset = horizonPresetSchema.parse(params.input.horizonPreset);

  const { setup, memoryDigest } = await loadSetupAndMemory(params.profileId, params.input.setup ?? null);
  const onboarding = params.input.onboarding ?? setup?.onboarding ?? null;
  const baselineMetrics = buildDefaultMetricsFromSetup(setup);
  const startDate = new Date();
  const profileDigest = buildProfileDigest(setup, onboarding);
  const modeTitle = mode === "auto_future" ? "Time Into The Future" : "Predict Your Future Manually";

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: insertedRun, error: runError } = await supabase
    .from("simulation_runs")
    .insert({
      profile_id: params.profileId,
      title,
      mode,
      horizon_preset: horizonPreset,
      status: "active",
      current_day: 0,
      started_at: now,
      baseline_metrics: baselineMetrics,
      latest_metrics: baselineMetrics,
      summary: {
        targetOutcome: targetOutcome || null,
      },
      updated_at: now,
    })
    .select("*")
    .single();
  if (runError) throw runError;
  const run = parseRunRow(insertedRun as RunRow);

  if (mode === "auto_future") {
    const { nodeCount } = horizonProfile(horizonPreset);
    const rawPlan =
      (await generateAutoTrajectoryPlan({
        profileDigest,
        memoryDigest,
        baselineMetrics,
        modeTitle,
        horizonPreset,
        targetOutcome,
        nodeCount,
      })) ?? fallbackAutoPlan(targetOutcome);
    const aiPlan = autoTrajectorySchema.parse(rawPlan);

    const nodes = buildAutoProjectionNodes({
      simulationId: run.id,
      profileId: params.profileId,
      mode,
      horizonPreset,
      baselineMetrics,
      startDate,
      plan: aiPlan,
    });
    await insertNodes(nodes);
    const latestNode = nodes[nodes.length - 1];
    const { error: updateError } = await supabase
      .from("simulation_runs")
      .update({
        current_day: latestNode.seq,
        latest_metrics: latestNode.metrics_snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("profile_id", params.profileId);
    if (updateError) throw updateError;
  } else {
    const startOptions = await generateManualOptions({
      profileDigest,
      memoryDigest,
      metrics: baselineMetrics,
      latestStory: "Simulation begins from the user's present-day state.",
    });

    await insertNodes([
      {
        simulation_id: run.id,
        profile_id: params.profileId,
        seq: 0,
        simulated_date: startDate.toISOString().slice(0, 10),
        action_type: "system",
        action_label: "Present-day baseline",
        action_details: "Manual timeline starts now.",
        story:
          "You start from your current reality. Each day, you can choose one of three suggested actions or define your own move.",
        changelog: [],
        metric_deltas: {},
        metrics_snapshot: baselineMetrics,
        next_options: startOptions,
      },
    ]);
  }

  return getSimulationWithNodes({ profileId: params.profileId, simulationId: run.id });
}

export async function ensureInitialSimulation(params: {
  profileId: string;
  setup?: UserSetup | null;
}) {
  const existing = await listSimulations(params.profileId, 1);
  if (existing.length > 0) {
    return getSimulationWithNodes({
      profileId: params.profileId,
      simulationId: existing[0].id,
      nodeLimit: 320,
    });
  }

  const setup = params.setup ?? null;
  const mode = setup?.preferences?.simulationMode ?? "manual_step";
  const horizonYears = Math.max(1, Math.min(60, setup?.preferences?.horizonYears ?? 10));
  const horizonPreset: SimulationHorizonPreset =
    horizonYears <= 1 ? "1_year" : horizonYears >= 50 ? "whole_life" : "10_years";

  return createSimulation({
    profileId: params.profileId,
    input: {
      title: "My First Simulation",
      mode,
      horizonPreset,
      setup,
      onboarding: setup?.onboarding ?? null,
      targetOutcome: setup?.onboarding?.targetOutcome ?? null,
    },
  });
}

export async function advanceManualSimulation(params: {
  profileId: string;
  simulationId: string;
  optionId?: string | null;
  customAction?: string | null;
}) {
  const selectedOptionId = cleanText(params.optionId, 120);
  const customAction = cleanText(params.customAction, 220);
  if (!selectedOptionId && !customAction) {
    throw new Error("Choose one predefined option or provide a custom action.");
  }

  const { run, nodes } = await getSimulationWithNodes({
    profileId: params.profileId,
    simulationId: params.simulationId,
    nodeLimit: 500,
  });
  if (run.mode !== "manual_step") {
    throw new Error("Only manual simulations can accept step actions.");
  }
  if (run.status !== "active") {
    throw new Error("This simulation has already ended.");
  }
  const latestNode = nodes[nodes.length - 1];
  if (!latestNode) {
    throw new Error("No baseline node found for this simulation.");
  }

  const selectedOption = selectedOptionId
    ? latestNode.nextOptions.find((option) => option.id === selectedOptionId)
    : null;
  const selectedActionLabel = selectedOption
    ? selectedOption.title
    : customAction || "Custom action";
  const selectedActionDetails = selectedOption
    ? selectedOption.description
    : customAction || "User-defined action.";
  const transition = deterministicTransition({
    currentMetrics: latestNode.metricsSnapshot,
    actionLabel: selectedActionLabel,
    actionDetails: selectedActionDetails,
    days: 1,
  });
  const metricDeltas = normalizeMetricPatch(transition.metricDeltas);
  const nextMetrics = transition.nextMetrics;

  const { setup, memoryDigest } = await loadSetupAndMemory(params.profileId);
  const profileDigest = buildProfileDigest(setup, setup?.onboarding ?? null);
  const aiOutcome = await generateManualOutcome({
    profileDigest,
    memoryDigest,
    selectedActionLabel,
    selectedActionDetails,
    latestStory: latestNode.story,
    latestMetrics: latestNode.metricsSnapshot,
  });
  const nextOptions = await generateManualOptions({
    profileDigest,
    memoryDigest,
    metrics: nextMetrics,
    latestStory: aiOutcome.story,
  });
  const nextSeq = latestNode.seq + 1;
  const latestDate = new Date(`${latestNode.simulatedDate}T00:00:00.000Z`);
  latestDate.setUTCDate(latestDate.getUTCDate() + 1);

  const nextNode: Omit<NodeRow, "id" | "created_at"> = {
    simulation_id: run.id,
    profile_id: params.profileId,
    seq: nextSeq,
    simulated_date: latestDate.toISOString().slice(0, 10),
    action_type: selectedOption ? "manual_predefined" : "manual_custom",
    action_label: cleanText(aiOutcome.actionLabel || selectedActionLabel, 90),
    action_details: cleanText(selectedActionDetails, 220),
    story: cleanText(aiOutcome.story, 1_200),
    changelog: transition.changelog.map((entry) => cleanText(entry, 180)).filter(Boolean),
    metric_deltas: metricDeltas,
    metrics_snapshot: nextMetrics,
    next_options: nextOptions.slice(0, 3).map((option) => ({
      ...option,
      id: option.id || crypto.randomUUID(),
      metricBias: normalizeMetricPatch(option.metricBias),
    })),
  };

  const supabase = getSupabaseAdmin();
  const { error: nodeError } = await supabase.from("simulation_nodes").insert(nextNode);
  if (nodeError) throw nodeError;

  const { error: runError } = await supabase
    .from("simulation_runs")
    .update({
      current_day: nextSeq,
      latest_metrics: nextMetrics,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("profile_id", params.profileId);
  if (runError) throw runError;

  return getSimulationWithNodes({
    profileId: params.profileId,
    simulationId: params.simulationId,
    nodeLimit: 500,
  });
}

function histogramFromNodes(
  nodes: SimulationNode[],
  key: keyof SimulationMetrics,
  slices = 12,
): Array<{ label: string; value: number }> {
  if (nodes.length === 0) return [];
  const every = Math.max(1, Math.floor(nodes.length / slices));
  const points: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < nodes.length; i += every) {
    points.push({
      label: `N${nodes[i].seq}`,
      value: Math.round(nodes[i].metricsSnapshot[key]),
    });
    if (points.length >= slices) break;
  }
  const last = nodes[nodes.length - 1];
  if (points[points.length - 1]?.label !== `N${last.seq}`) {
    points.push({
      label: `N${last.seq}`,
      value: Math.round(last.metricsSnapshot[key]),
    });
  }
  return points;
}

export async function endSimulation(params: {
  profileId: string;
  simulationId: string;
}) {
  const { run, nodes } = await getSimulationWithNodes({
    profileId: params.profileId,
    simulationId: params.simulationId,
    nodeLimit: 600,
  });
  if (run.status === "ended") {
    return { run, nodes, wrap: parseJsonObject(run.summary?.wrap) };
  }

  const first = nodes[0]?.metricsSnapshot ?? run.baselineMetrics;
  const last = nodes[nodes.length - 1]?.metricsSnapshot ?? run.latestMetrics;
  const gains = [
    { key: "career", delta: last.career - first.career },
    { key: "netWorth", delta: last.netWorth - first.netWorth },
    { key: "health", delta: last.health - first.health },
    { key: "relationships", delta: last.relationships - first.relationships },
    { key: "fulfillment", delta: last.fulfillment - first.fulfillment },
  ].sort((a, b) => b.delta - a.delta);

  const wrap = {
    title: run.title,
    mode: run.mode,
    totalNodes: nodes.length,
    durationDays: run.currentDay,
    topGrowthMetric: gains[0]?.key ?? "career",
    topGrowthValue: Math.round(gains[0]?.delta ?? 0),
    topStoryMoments: nodes
      .filter((node) => node.story.length > 0)
      .slice(-5)
      .map((node) => ({
        seq: node.seq,
        label: node.actionLabel,
        story: node.story,
      })),
    careerChart: histogramFromNodes(nodes, "career"),
    healthChart: histogramFromNodes(nodes, "health"),
    netWorthChart: histogramFromNodes(nodes, "netWorth"),
    finalMetrics: last,
    summaryParagraph: `Across ${nodes.length} timeline nodes, your strongest momentum appeared in ${gains[0]?.key ?? "career"} while ${gains[gains.length - 1]?.key ?? "health"} was the hardest to maintain.`,
  };

  const summary = {
    ...parseJsonObject(run.summary),
    endedAt: new Date().toISOString(),
    wrap,
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("simulation_runs")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.simulationId)
    .eq("profile_id", params.profileId);
  if (error) throw error;

  return {
    run: {
      ...run,
      status: "ended" as const,
      endedAt: summary.endedAt as string,
      summary,
    },
    nodes,
    wrap,
  };
}

export async function updateSimulation(params: {
  profileId: string;
  simulationId: string;
  updates: { title?: string };
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_runs")
    .update({
      title: params.updates.title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.simulationId)
    .eq("profile_id", params.profileId)
    .select()
    .single();

  if (error) throw error;
  return parseRunRow(data as RunRow);
}

export function inferSimulationDefaultsFromOnboarding(
  snapshot: OnboardingSnapshot | undefined,
): {
  mode: SimulationMode;
  horizonPreset: SimulationHorizonPreset;
  horizonYears: number;
} {
  const mode = snapshot?.simulationMode ?? "manual_step";
  const horizonPreset = snapshot?.simulationHorizonPreset ?? "10_years";
  return {
    mode,
    horizonPreset,
    horizonYears: horizonPresetToYears(horizonPreset),
  };
}
