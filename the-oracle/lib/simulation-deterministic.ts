import type { SimulationMetrics } from "@/lib/types";

/**
 * Deterministic metric engine:
 * - Action text -> fixed feature vector (keyword activations, no randomness)
 * - Per-day state transition equations over stress, time budget, health,
 *   relationships, career, salary, expenses, net worth, money score,
 *   fulfillment, confidence
 * - Multi-day projection = repeated daily transitions
 *
 * This module intentionally contains zero LLM-derived numeric changes.
 */
export const simulationMetricKeys: Array<keyof SimulationMetrics> = [
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

type ActionFeatureVector = {
  work: number;
  learning: number;
  health: number;
  relationships: number;
  finance: number;
  leisure: number;
  risk: number;
  discipline: number;
  spending: number;
  social: number;
};

export type DeterministicTransitionResult = {
  nextMetrics: SimulationMetrics;
  metricDeltas: Partial<SimulationMetrics>;
  featureVector: ActionFeatureVector;
  changelog: string[];
  impactHint: string;
};

type TransitionInput = {
  currentMetrics: SimulationMetrics;
  actionLabel: string;
  actionDetails?: string;
  days?: number;
};

type KeywordWeight = [term: string, weight: number];

const keywordMap: Record<keyof ActionFeatureVector, KeywordWeight[]> = {
  work: [
    ["work", 0.5],
    ["project", 0.6],
    ["deadline", 0.8],
    ["launch", 0.8],
    ["startup", 1.0],
    ["promotion", 1.0],
    ["interview", 0.7],
    ["build", 0.6],
    ["ship", 0.6],
    ["overtime", 1.0],
    ["manager", 0.6],
    ["client", 0.5],
  ],
  learning: [
    ["learn", 0.8],
    ["study", 0.8],
    ["course", 0.9],
    ["practice", 0.7],
    ["read", 0.5],
    ["research", 0.8],
    ["mentor", 0.7],
    ["certificate", 1.0],
    ["skill", 0.8],
  ],
  health: [
    ["sleep", 1.0],
    ["gym", 1.0],
    ["workout", 1.0],
    ["exercise", 1.0],
    ["walk", 0.6],
    ["run", 0.8],
    ["meditate", 0.8],
    ["therapy", 0.8],
    ["meal prep", 0.9],
    ["nutrition", 0.8],
    ["doctor", 0.9],
    ["recovery", 0.8],
  ],
  relationships: [
    ["family", 1.0],
    ["partner", 1.0],
    ["friend", 0.9],
    ["date", 0.8],
    ["call", 0.6],
    ["visit", 0.7],
    ["relationship", 1.0],
    ["community", 0.8],
    ["apologize", 0.9],
    ["support", 0.7],
  ],
  finance: [
    ["budget", 1.0],
    ["save", 0.9],
    ["invest", 1.0],
    ["portfolio", 0.9],
    ["debt", 0.9],
    ["pay off", 1.0],
    ["expense", 0.8],
    ["income", 0.8],
    ["raise", 0.7],
    ["side hustle", 1.0],
    ["freelance", 0.7],
    ["tax", 0.8],
  ],
  leisure: [
    ["rest", 0.9],
    ["vacation", 1.0],
    ["break", 0.8],
    ["weekend", 0.6],
    ["hobby", 0.9],
    ["game", 0.7],
    ["movie", 0.5],
    ["relax", 0.9],
    ["travel", 0.8],
    ["fun", 0.6],
  ],
  risk: [
    ["quit", 1.0],
    ["all-in", 1.0],
    ["gamble", 1.0],
    ["leverage", 1.0],
    ["bet", 0.9],
    ["speculative", 1.0],
    ["crypto", 0.8],
    ["aggressive", 0.8],
    ["risky", 1.0],
    ["move countries", 0.9],
  ],
  discipline: [
    ["routine", 1.0],
    ["consistency", 1.0],
    ["plan", 0.8],
    ["track", 0.7],
    ["schedule", 0.8],
    ["focus", 0.8],
    ["habit", 0.8],
    ["daily", 0.7],
    ["weekly", 0.6],
    ["system", 0.7],
  ],
  spending: [
    ["shopping", 0.9],
    ["buy", 0.8],
    ["purchase", 0.8],
    ["luxury", 1.0],
    ["upgrade", 0.8],
    ["subscription", 0.7],
    ["impulse", 1.0],
    ["party", 0.7],
    ["dining out", 0.8],
    ["trip", 0.7],
  ],
  social: [
    ["network", 0.9],
    ["event", 0.8],
    ["conference", 0.8],
    ["meetup", 0.8],
    ["team", 0.6],
    ["collaborate", 0.8],
    ["club", 0.7],
    ["community", 0.7],
    ["host", 0.8],
    ["group", 0.6],
  ],
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokensFromText(text: string): Set<string> {
  return new Set(text.split(/\s+/g).filter(Boolean));
}

function keywordScore(text: string, tokenSet: Set<string>, keywords: KeywordWeight[]): number {
  let score = 0;
  for (const [term, weight] of keywords) {
    if (term.includes(" ")) {
      if (text.includes(term)) score += weight;
    } else if (tokenSet.has(term)) {
      score += weight;
    }
  }
  return score;
}

function activation(raw: number): number {
  return clamp01(1 - Math.exp(-Math.max(0, raw)));
}

function extractActionFeatures(actionLabel: string, actionDetails?: string): ActionFeatureVector {
  const merged = normalizeText(`${actionLabel || ""} ${actionDetails || ""}`);
  const tokenSet = tokensFromText(merged);

  const base: ActionFeatureVector = {
    work: 0.35,
    learning: 0.28,
    health: 0.28,
    relationships: 0.28,
    finance: 0.30,
    leisure: 0.24,
    risk: 0.20,
    discipline: 0.26,
    spending: 0.22,
    social: 0.25,
  };

  const features = { ...base };
  (Object.keys(keywordMap) as Array<keyof ActionFeatureVector>).forEach((key) => {
    const score = keywordScore(merged, tokenSet, keywordMap[key]);
    const bonus = activation(score);
    features[key] = clamp01(base[key] + bonus * 0.62);
  });

  if (features.work > 0.7 && features.leisure < 0.45) {
    features.discipline = clamp01(features.discipline + 0.06);
  }
  if (features.finance > 0.68) {
    features.spending = clamp01(features.spending - 0.08);
  }
  if (features.relationships > 0.6 || features.social > 0.6) {
    features.work = clamp01(features.work - 0.04);
  }
  if (features.health > 0.65) {
    features.risk = clamp01(features.risk - 0.05);
  }

  return features;
}

function effectiveTaxRate(annualSalaryUsd: number): number {
  const salary = Math.max(0, annualSalaryUsd);
  if (salary <= 0) return 0;
  const brackets: Array<{ cap: number; rate: number }> = [
    { cap: 11_600, rate: 0.10 },
    { cap: 47_150, rate: 0.12 },
    { cap: 100_525, rate: 0.22 },
    { cap: 191_950, rate: 0.24 },
    { cap: 243_725, rate: 0.32 },
    { cap: 609_350, rate: 0.35 },
    { cap: Number.POSITIVE_INFINITY, rate: 0.37 },
  ];

  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    if (salary <= lower) break;
    const taxable = Math.min(salary, bracket.cap) - lower;
    if (taxable > 0) tax += taxable * bracket.rate;
    lower = bracket.cap;
  }
  return clamp(tax / salary, 0.06, 0.45);
}

function clampMetricValue(key: keyof SimulationMetrics, value: number): number {
  if (key === "netWorth") return clamp(Math.round(value), -500_000_000, 5_000_000_000);
  if (key === "salary") return clamp(Math.round(value), 0, 2_000_000);
  if (key === "monthlyExpenses") return clamp(Math.round(value), 0, 1_000_000);
  if (key === "projectedDeathDate") return value;
  if (key === "relationships" || key === "freeTime") return clamp(Number(value.toFixed(1)), 0, 168);
  return clamp(Number(value.toFixed(2)), 0, 100);
}

function toScore(value: number): number {
  return clamp01(value / 100);
}

function summarizeDeltaLines(deltas: Partial<SimulationMetrics>): string[] {
  const lines: string[] = [];
  const keyLabels: Partial<Record<keyof SimulationMetrics, string>> = {
    projectedDeathDate: "Proj. Death",
    netWorth: "Net Worth",
    monthlyExpenses: "Expenses",
    freeTime: "Free Time"
  };

  for (const key of simulationMetricKeys) {
    const value = deltas[key];
    if (typeof value !== "number") continue;

    const label = keyLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);

    if (key === "projectedDeathDate") {
      const daysDelta = Math.round(value / (1000 * 60 * 60 * 24));
      if (Math.abs(daysDelta) < 1) continue;
      const sign = daysDelta > 0 ? "+" : "";
      lines.push(`${label}: ${sign}${daysDelta} days`);
      continue;
    }

    if ((key === "salary" || key === "netWorth" || key === "monthlyExpenses") && Math.abs(value) < 1) continue;
    if (key !== "salary" && key !== "netWorth" && key !== "monthlyExpenses" && Math.abs(value) < 0.05) continue;
    const sign = value > 0 ? "+" : "";
    if (key === "salary" || key === "netWorth" || key === "monthlyExpenses") {
      lines.push(`${label}: ${sign}$${Math.round(value).toLocaleString()}`);
    } else {
      lines.push(`${label}: ${sign}${value.toFixed(1)}`);
    }
  }
  return lines.slice(0, 6);
}

function buildImpactHint(deltas: Partial<SimulationMetrics>): string {
  const tracked: Array<{
    key: keyof SimulationMetrics;
    label: string;
    value: number;
  }> = [
      { key: "career", label: "career", value: deltas.career ?? 0 },
      { key: "netWorth", label: "net worth", value: deltas.netWorth ? (deltas.netWorth > 0 ? 0.3 : -0.3) : 0 },
      { key: "health", label: "health", value: deltas.health ?? 0 },
      { key: "relationships", label: "relationships", value: deltas.relationships ?? 0 },
      { key: "fulfillment", label: "fulfillment", value: deltas.fulfillment ?? 0 },
      { key: "stress", label: "stress", value: -(deltas.stress ?? 0) },
      { key: "freeTime", label: "free time", value: deltas.freeTime ?? 0 },
    ];
  tracked.sort((a, b) => b.value - a.value);
  const best = tracked[0];
  const worst = tracked[tracked.length - 1];
  if (!best || !worst) return "Balanced impact across life metrics.";
  if (best.value < 0.2 && worst.value > -0.2) return "Small but steady compounding impact.";
  if (worst.value < -0.4) {
    return `Likely boosts ${best.label}, but may trade off ${worst.label}.`;
  }
  return `Likely improves ${best.label} with manageable side effects.`;
}

function computeDailyMetrics(
  current: SimulationMetrics,
  features: ActionFeatureVector,
): SimulationMetrics {
  const healthScore = toScore(current.health);
  const careerScore = toScore(current.career);
  const relationshipScore = clamp01(current.relationships / 30);
  const freeTimeScore = clamp01(current.freeTime / 50);
  const confidenceScore = toScore(current.confidence);

  const recoveryFocus = clamp01(
    0.22 + 0.45 * features.health + 0.38 * features.leisure + 0.24 * features.discipline - 0.2 * features.work,
  );
  const learningIntent = clamp01(
    0.20 + 0.58 * features.learning + 0.20 * features.work + 0.16 * features.discipline - 0.10 * features.leisure,
  );
  const workload = clamp01(
    0.30
    + 0.55 * features.work
    + 0.24 * features.learning
    + 0.15 * features.risk
    - 0.22 * recoveryFocus
    - 0.12 * features.discipline,
  );
  const socialInvestment = clamp01(
    0.20
    + 0.60 * features.relationships
    + 0.22 * features.social
    + 0.14 * features.leisure
    - 0.22 * features.work,
  );

  const taxRate = effectiveTaxRate(current.salary);
  const afterTaxMonthly = (current.salary * (1 - taxRate)) / 12;
  const baselineExpenseBurden = clamp01(current.monthlyExpenses / Math.max(500, afterTaxMonthly));
  const debtPressure = clamp01((-current.netWorth) / 140_000);
  const financialStrain = clamp01(0.58 * baselineExpenseBurden + 0.20 * debtPressure);
  const socialConflict = clamp01(0.50 + 0.40 * workload - 0.48 * socialInvestment + 0.12 * features.risk);

  const stressTarget = clamp(
    38 + 34 * workload + 22 * financialStrain + 16 * socialConflict - 31 * recoveryFocus - 9 * features.discipline,
    0,
    100,
  );
  const stress = clampMetricValue("stress", current.stress + 0.18 * (stressTarget - current.stress));
  const stressNorm = toScore(stress);

  const workHours = clamp(
    38
    + 22 * features.work
    + 10 * features.learning
    - 12 * features.leisure
    - 8 * features.relationships
    + 6 * features.risk
    - 5 * features.discipline,
    20,
    75,
  );
  const socialHours = clamp(6 + 14 * socialInvestment + 5 * features.social - 4 * features.work, 1, 26);
  const healthHours = clamp(5 + 11 * features.health + 4 * features.discipline - 3 * features.work, 2, 18);
  const maintenanceHours = 63;
  const discretionaryHours = clamp(168 - maintenanceHours - workHours - socialHours - healthHours, 0, 56);
  const freeTimeTarget = discretionaryHours;
  const freeTime = clampMetricValue("freeTime", current.freeTime + 0.23 * (freeTimeTarget - current.freeTime));
  const freeTimeNorm = clamp01(freeTime / 50);

  const burnoutRisk = clamp01(
    0.42 * stressNorm
    + 0.28 * (1 - healthScore)
    + 0.18 * workload
    + 0.12 * (1 - freeTimeNorm)
    - 0.20 * recoveryFocus,
  );
  const healthTarget = clamp(
    46
    + 30 * recoveryFocus
    + 12 * features.health
    + 6 * features.discipline
    - 22 * stressNorm
    - 12 * burnoutRisk
    - 8 * financialStrain,
    0,
    100,
  );
  const health = clampMetricValue("health", current.health + 0.16 * (healthTarget - current.health));

  const socialHoursTarget = clamp(socialHours + 2 * features.discipline + 2 * freeTimeNorm - 3 * stressNorm - 2 * workload, 0, 168);
  const relationships = clampMetricValue(
    "relationships",
    current.relationships + 0.18 * (socialHoursTarget - current.relationships),
  );

  const careerTarget = clamp(
    45 + 28 * learningIntent + 20 * features.work + 7 * features.discipline + 6 * confidenceScore - 18 * burnoutRisk - 10 * stressNorm,
    0,
    100,
  );
  const career = clampMetricValue("career", current.career + 0.14 * (careerTarget - current.career));
  const careerNorm = toScore(career);

  const salaryTarget = clamp(
    24_000
    + career * 1_400
    + confidenceScore * 22_000
    + learningIntent * 18_000
    - burnoutRisk * 12_000,
    20_000,
    2_000_000,
  );
  const marketDriftRate = clamp(
    0.00007 + 0.0004 * (features.work - 0.5) + 0.00025 * (learningIntent - 0.5) - 0.00035 * burnoutRisk,
    -0.0005,
    0.0007,
  );
  const salary = clampMetricValue(
    "salary",
    current.salary + 0.0012 * (salaryTarget - current.salary) + current.salary * marketDriftRate,
  );

  const nextTaxRate = effectiveTaxRate(salary);
  const afterTaxMonthlyNext = (salary * (1 - nextTaxRate)) / 12;
  const savingsIntent = clamp01(
    0.30 + 0.55 * features.finance + 0.25 * features.discipline - 0.35 * features.spending,
  );
  const spendingImpulse = clamp01(
    0.42 + 0.55 * features.spending + 0.18 * features.risk - 0.28 * features.finance - 0.22 * features.discipline,
  );
  const expensesTarget = clamp(
    afterTaxMonthlyNext * (0.54 + 0.36 * spendingImpulse - 0.20 * savingsIntent) + 180 + debtPressure * 600,
    500,
    1_000_000,
  );
  const monthlyExpenses = clampMetricValue(
    "monthlyExpenses",
    current.monthlyExpenses + clamp(0.12 * (expensesTarget - current.monthlyExpenses), -140, 140),
  );

  let expectedReturnAnnual = clamp(
    0.015
    + 0.08 * features.finance
    + 0.05 * features.discipline
    + 0.03 * careerNorm
    - 0.05 * features.risk
    - 0.05 * financialStrain,
    -0.20,
    0.22,
  );
  if (current.netWorth < 0) {
    expectedReturnAnnual = -(0.11 + 0.08 * financialStrain);
  }

  const cashflowMonthly = afterTaxMonthlyNext - monthlyExpenses;
  const netWorth = clampMetricValue(
    "netWorth",
    current.netWorth + (cashflowMonthly / 30) + current.netWorth * (expectedReturnAnnual / 365),
  );

  const expenseBurden = clamp01(monthlyExpenses / Math.max(600, afterTaxMonthlyNext));
  const wealthSignal = clamp01((netWorth + 60_000) / 360_000);
  const salarySignal = clamp01((salary - 24_000) / 180_000);
  const cashflowSignal = clamp01((cashflowMonthly + 1_200) / 4_200);
  const moneyScoreRaw = clamp01((18 + 40 * wealthSignal + 25 * salarySignal + 24 * cashflowSignal - 18 * expenseBurden) / 100);

  const needsCareer = 1 - careerScore;
  const needsHealth = 1 - healthScore;
  const needsRelationships = 1 - relationshipScore;
  const needsMoney = 1 - moneyScoreRaw;
  const needsFreeTime = 1 - freeTimeScore;
  const needWeightSum = needsCareer + needsHealth + needsRelationships + needsMoney + needsFreeTime + 1e-6;
  const actionNeedAlignment = clamp01(
    (
      features.work * needsCareer
      + features.health * needsHealth
      + features.relationships * needsRelationships
      + features.finance * needsMoney
      + features.leisure * needsFreeTime
    ) / needWeightSum,
  );

  const fulfillmentTarget = clamp(
    26
    + 0.22 * career
    + 0.22 * relationshipScore * 100
    + 0.20 * health
    + 0.14 * moneyScoreRaw * 100
    + 0.14 * freeTimeScore * 100
    - 0.18 * stress
    + 10 * (actionNeedAlignment - 0.5),
    0,
    100,
  );
  const fulfillment = clampMetricValue(
    "fulfillment",
    current.fulfillment + 0.16 * (fulfillmentTarget - current.fulfillment),
  );

  const progressSignal = clamp(
    ((career - current.career) + (health - current.health) + (relationshipScore * 100 - clamp01(current.relationships / 30) * 100)) / 15,
    -1,
    1,
  );
  const confidenceTarget = clamp(
    22
    + 0.30 * career
    + 0.20 * moneyScoreRaw * 100
    + 0.16 * health
    + 0.14 * relationshipScore * 100
    + 0.18 * fulfillment
    - 0.24 * stress
    + 8 * progressSignal,
    0,
    100,
  );
  const confidence = clampMetricValue(
    "confidence",
    current.confidence + 0.17 * (confidenceTarget - current.confidence),
  );

  const healthDelta = health - current.health;
  const stressDelta = current.stress - stress;
  const daysAddedToLife = (healthDelta * 3) + (stressDelta * 1) + (features.health * 2 - features.risk * 5);
  const projectedDeathDate = clampMetricValue(
    "projectedDeathDate",
    current.projectedDeathDate + daysAddedToLife * 24 * 60 * 60 * 1000,
  );

  return {
    health,
    career,
    relationships,
    fulfillment,
    stress,
    freeTime,
    netWorth,
    salary,
    monthlyExpenses,
    confidence,
    projectedDeathDate,
  };
}

export function deterministicTransition(params: TransitionInput): DeterministicTransitionResult {
  const days = Math.max(1, Math.min(3_650, Math.round(params.days ?? 1)));
  const featureVector = extractActionFeatures(params.actionLabel, params.actionDetails);
  const baseline = { ...params.currentMetrics };
  let current = { ...params.currentMetrics };

  for (let day = 0; day < days; day += 1) {
    current = computeDailyMetrics(current, featureVector);
  }

  const metricDeltas: Partial<SimulationMetrics> = {};
  for (const key of simulationMetricKeys) {
    const delta = current[key] - baseline[key];
    metricDeltas[key] = key === "salary" || key === "netWorth" || key === "monthlyExpenses" || key === "projectedDeathDate"
      ? Math.round(delta)
      : Number(delta.toFixed(2));
  }

  return {
    nextMetrics: current,
    metricDeltas,
    featureVector,
    changelog: summarizeDeltaLines(metricDeltas),
    impactHint: buildImpactHint(metricDeltas),
  };
}
