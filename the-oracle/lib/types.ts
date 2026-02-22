export type FactorId =
  | "health"
  | "career"
  | "freeTime"
  | "fulfillment"
  | "relationships"
  | "netWorthLiquid"
  | "netWorthIlliquid"
  | "netWorthTotal"
  | "lifeExpectancy"
  | "projectedDeathDate"
  | "freeTimeHours"
  | "careerPath"
  | "relationshipHoursTotal"
  | string;

export type FactorType = "score" | "quantity" | "probability" | "goal";

export type FactorDefinition = {
  id: FactorId;
  label: string;
  type: FactorType;
  unit: string;
  description?: string;
  enabled: boolean;
};

export type UserFactor = FactorDefinition & {
  baseline: {
    value: number;
    details?: Record<string, unknown>;
    source?: "self_report" | "wearable" | "import";
    confidence?: "low" | "medium" | "high";
  };
  goal?: {
    targetDate?: string;
    successCriteria?: string;
    currentProgress?: number;
    plan?: {
      summary?: string;
      weeklyHours?: number;
      steps?: string[];
    };
  };
};

export type LovedOne = {
  id: string;
  name: string;
  relation?: string;
  relationshipKind?:
  | "mum"
  | "dad"
  | "parent"
  | "partner"
  | "child"
  | "sibling"
  | "friend"
  | "mentor"
  | "other";
  relationshipStatus?: "active" | "strained" | "estranged" | "deceased";
  age?: number;
  birthYear?: number;
  typicalHoursPerMonth?: number;
  notes?: string;
};

export type OnboardingAvatarAccessory =
  | "none"
  | "cap"
  | "headphones"
  | "glasses"
  | "star";

export type OnboardingAvatarExpression =
  | "calm"
  | "smile"
  | "focused"
  | "curious";

export type OnboardingAvatar = {
  spriteId: string;
  paletteId: string;
  accessory: OnboardingAvatarAccessory;
  expression: OnboardingAvatarExpression;
};

export type OnboardingLinkedinProfile = {
  source: "apify" | "resume";
  profileUrl: string;
  scrapedAt: string;
  fullName?: string;
  headline?: string;
  location?: string;
  about?: string;
  experiences: string[];
  projects: string[];
  skills: string[];
  education: string[];
  certifications: string[];
};

export type OnboardingInterviewDomainId =
  | "decision_archaeology"
  | "stress_response"
  | "habits_rhythm"
  | "health"
  | "relationships"
  | "money";

export type OnboardingInterviewMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  domainId?: OnboardingInterviewDomainId;
};

export type OnboardingDomainReflection = {
  domainId: OnboardingInterviewDomainId;
  summary: string;
  coverage: number;
  confidence: "low" | "medium" | "high";
  evidence: string[];
};

export type SimulationHorizonPreset =
  | "whole_life"
  | "10_years"
  | "1_year"
  | "1_week";

export type SimulationMode = "auto_future" | "manual_step";

export type SimulationIntent =
  | "career_path"
  | "future_timeline";

export type OnboardingSnapshot = {
  version: "v1";
  completedAt: string;
  avatar: OnboardingAvatar;
  resumeText?: string;
  linkedinProfile?: OnboardingLinkedinProfile;
  lifeStory: string;
  interviewMessages: OnboardingInterviewMessage[];
  reflections: OnboardingDomainReflection[];
  simulationMode: SimulationMode;
  simulationHorizonPreset: SimulationHorizonPreset;
  simulationIntents?: SimulationIntent[];
  targetOutcome?: string;
};

export type ModelVariableKind =
  | "scalar"
  | "distribution"
  | "categorical"
  | "boolean";

export type ModelVariableSource =
  | "derived"
  | "user"
  | "wearable"
  | "import"
  | "research";

type ModelVariableBase = {
  id: string;
  label: string;
  unit: string;
  kind: ModelVariableKind;
  confidence: "low" | "medium" | "high";
  source: ModelVariableSource;
  rationale?: string;
  updatedAt: string;
};

export type ModelVariable =
  | (ModelVariableBase & {
    kind: "scalar";
    value: number;
    min?: number;
    max?: number;
  })
  | (ModelVariableBase & {
    kind: "distribution";
    p10: number;
    p50: number;
    p90: number;
    min?: number;
    max?: number;
  })
  | (ModelVariableBase & {
    kind: "categorical";
    value: string;
    options?: string[];
  })
  | (ModelVariableBase & {
    kind: "boolean";
    value: boolean;
  });

export type SimulationModel = {
  version: "career-v1";
  variables: Record<string, ModelVariable>;
};

export type UserSetup = {
  version: "v4";
  createdAt: string;
  updatedAt: string;
  profile: {
    name?: string;
    age?: number;
    location?: string;
    occupation?: string;
    company?: string;
  };
  model: SimulationModel;
  factors: UserFactor[];
  lovedOnes: LovedOne[];
  preferences: {
    horizonYears: number;
    simulationMode: SimulationMode;
    includeLongevity: boolean;
    includeLovedOnesLongevity: boolean;
    hasCompletedTutorial?: boolean;
  };
  onboarding?: OnboardingSnapshot;
};

export type SimulationMetrics = {
  health: number;
  career: number;
  relationships: number;
  fulfillment: number;
  stress: number;
  freeTime: number;
  netWorth: number;
  salary: number;
  monthlyExpenses: number;
  confidence: number;
  projectedDeathDate: number;
};

export type SimulationActionType =
  | "auto_projection"
  | "manual_predefined"
  | "manual_custom"
  | "system";

export type SimulationActionOption = {
  id: string;
  title: string;
  description: string;
  impactHint: string;
  metricBias?: Partial<SimulationMetrics>;
};

export type SimulationRun = {
  id: string;
  profileId: string;
  title: string;
  mode: SimulationMode;
  horizonPreset: SimulationHorizonPreset;
  status: "active" | "ended";
  currentDay: number;
  startedAt: string;
  endedAt?: string | null;
  baselineMetrics: SimulationMetrics;
  latestMetrics: SimulationMetrics;
  summary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SimulationNode = {
  id: string;
  simulationId: string;
  profileId: string;
  seq: number;
  simulatedDate: string;
  actionType: SimulationActionType;
  actionLabel: string;
  actionDetails?: string | null;
  story: string;
  changelog: string[];
  metricDeltas: Partial<SimulationMetrics>;
  metricsSnapshot: SimulationMetrics;
  nextOptions: SimulationActionOption[];
  createdAt: string;
};

export type FactorSnapshot = {
  id: FactorId;
  value: number;
  unit: string;
  trend: number;
  confidence: "low" | "medium" | "high";
};

export type LifeState = {
  setup: UserSetup | null;
  factors: Record<string, FactorSnapshot>;
  updatedAt: string;
  confidence: {
    dataCoverage: "low" | "medium" | "high";
    evidenceStrength: "low" | "medium" | "high";
    modelUncertainty: "low" | "medium" | "high";
  };
};

export type LifeEvent = {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  scenarioId?: string;
};

export type Scenario = {
  id: string;
  name: string;
  parentId?: string | null;
  baseDate: string;
  createdAt: string;
  isCanonical?: boolean;
  forkedFromNodeId?: string | null;
};

export type ScenarioNodeKind =
  | "root"
  | "action_commit"
  | "forecast_run"
  | "override_commit";

export type ScenarioNode = {
  id: string;
  scenarioId: string;
  parentNodeId?: string | null;
  createdAt: string;
  kind: ScenarioNodeKind;
  label: string;
  eventIds: string[];
  eventCount: number;
  regimeProfile?: "base" | "headwind" | "tailwind";
  modelVersionSet?: string;
  stateSnapshotHash?: string;
};

export type ActionBatchAction = {
  id: string;
  type: string;
  text: string;
  effectiveDate?: string | null;
  scope?: "timeline" | "global";
};

export type ActionBatch = {
  id: string;
  scenarioId: string;
  nodeId: string;
  createdAt: string;
  label: string;
  actions: ActionBatchAction[];
  eventIds: string[];
  eventCount: number;
};

export type ForecastPoint = {
  year: number;
  p10: number;
  p50: number;
  p90: number;
};

export type ForecastMetricDisplay = "trend" | "status" | "number" | "path";

export type ForecastMetricStatus = {
  word: string;
  rationale?: string;
};

export type ForecastMetricModelComponent = {
  id: string;
  label: string;
  value: number;
  weight: number;
  unit?: string;
  adjustable?: boolean;
};

export type ForecastMetricModel = {
  equation?: string;
  summary?: string;
  components: ForecastMetricModelComponent[];
};

export type ForecastMetricPathOption = {
  id: string;
  label: string;
  probability: number;
  rationale?: string;
};

export type ForecastMetric = {
  metricId: FactorId;
  label?: string;
  description?: string;
  unit?: string;
  type?: FactorType;
  display?: ForecastMetricDisplay;
  status?: ForecastMetricStatus;
  confidence?: "low" | "medium" | "high";
  pathOptions?: ForecastMetricPathOption[];
  model?: ForecastMetricModel;
  points: ForecastPoint[];
};

export type ForecastResult = {
  generatedAt: string;
  horizonYears?: number;
  metrics: ForecastMetric[];
  assumptions: string[];
  highlights?: string[];
};

export type ForecastCritique = {
  risks: string[];
  sensitivities: string[];
  confidence: {
    dataCoverage: "low" | "medium" | "high";
    evidenceStrength: "low" | "medium" | "high";
    modelUncertainty: "low" | "medium" | "high";
  };
};

export type TruthLabel = "observed" | "inferred" | "assumed" | "user_override";

export type TickUnit = "week" | "month" | "quarter" | "year";

export type ActionSpecKind =
  | "career_growth"
  | "career_change"
  | "health_habit"
  | "time_boundary"
  | "relationship_investment"
  | "money_strategy"
  | "custom";

export type ActionSpec = {
  id: string;
  kind: ActionSpecKind;
  text: string;
  target?: string;
  cadencePerMonth?: number;
  intensity?: number;
  startDate?: string | null;
  durationMonths?: number | null;
  scope?: "timeline" | "global";
  confidence?: "low" | "medium" | "high";
  tags?: string[];
};

export type WorldEventEffect = {
  path: string;
  delta: number;
  unit?: string;
};

export type WorldEvent = {
  id: string;
  type: string;
  timestamp: string;
  monthOffset: number;
  description: string;
  source: "system" | "user_action" | "scenario" | "llm";
  tags: string[];
  probability?: number;
  magnitude?: number;
  effects: WorldEventEffect[];
};

export type RelationshipPrimitive = {
  personId: string;
  name: string;
  relationshipKind?: LovedOne["relationshipKind"];
  relationshipStatus?: LovedOne["relationshipStatus"];
  age?: number;
  timeTogetherHoursMonthly: number;
  closenessProbability1y: number;
  closenessProbability5y: number;
  expectedTimeLeftTogetherHours: number;
};

export type WorldState = {
  now: string;
  monthIndex: number;
  person: {
    ageYears: number;
    biologicalAgeYears: number;
    lifeExpectancyYears: number;
    projectedDeathYear: number;
  };
  time: {
    workHoursWeekly: number;
    commuteHoursWeekly: number;
    sleepHoursNightly: number;
    discretionaryHoursWeekly: number;
    bufferHoursWeekly: number;
    vacationDaysPlannedYearly: number;
    vacationDaysTakenYearly: number;
    burnoutRisk12m: number;
  };
  health: {
    stressLoad: number;
    exerciseSessionsWeekly: number;
    healthShockRisk12m: number;
  };
  money: {
    grossIncomeAnnualUsd: number;
    effectiveTaxRate: number;
    fixedExpensesMonthlyUsd: number;
    variableExpensesMonthlyUsd: number;
    afterTaxCashflowMonthlyUsd: number;
    liquidAssetsUsd: number;
    illiquidAssetsUsd: number;
    totalNetWorthUsd: number;
    debtBalanceUsd: number;
    debtApr: number;
    runwayMonths: number;
    taxPaidAnnualUsd: number;
  };
  career: {
    currentTitle: string;
    currentLevel: string;
    promotionProbability12m: number;
    roleChangeProbability12m: number;
    topRolePaths: Array<{
      id: string;
      label: string;
      probability: number;
    }>;
  };
  relationships: {
    people: RelationshipPrimitive[];
  };
};

export type CoreOutputMetric = {
  id: string;
  label: string;
  unit: string;
  p10: number;
  p50: number;
  p90: number;
  scenarioLow?: number;
  scenarioHigh?: number;
};

export type CoreOutputCategory = {
  id: "time" | "health" | "relationships" | "money" | "career";
  label: string;
  metrics: CoreOutputMetric[];
  context?: Record<string, unknown>;
};

export type CoreOutputBundle = {
  generatedAt: string;
  tick: TickUnit;
  horizonYears: number;
  categories: CoreOutputCategory[];
};

export type ScenarioFork = {
  id: "baseline" | "optimistic" | "pessimistic";
  label: string;
  worldTrace: WorldEvent[];
  states: WorldState[];
};

export type LegacySimulationRun = {
  id: string;
  createdAt: string;
  tick: TickUnit;
  horizonYears: number;
  baseline: ScenarioFork;
  optimistic?: ScenarioFork;
  pessimistic?: ScenarioFork;
};

export type AreaAggregation = "avg" | "sum" | "min" | "max";

export type CategoryCausalityTier =
  | "causal_core"
  | "causal_extended"
  | "observational";

export type CategoryMeasurementSource = {
  sourceType: "primitive" | "event_tag" | "derived_metric";
  key: string;
  weight?: number;
};

export type CategorySpec = {
  id: string;
  label: string;
  unit: string;
  causalityTier: CategoryCausalityTier;
  measurementSources: CategoryMeasurementSource[];
  transitionFormula?: string;
  outputMetrics: Array<{
    id: string;
    label: string;
    unit: string;
    kind: "quantity" | "probability" | "currency" | "count" | "rate";
  }>;
  confidence: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
};

export type AreaDefinition = {
  id: string;
  label: string;
  description?: string;
  metricId?: string;
  metricIds?: string[];
  metricPattern?: string;
  aggregation?: AreaAggregation;
  core?: boolean;
};

export type ValueSetDirection = "maximize" | "minimize" | "target";

export type ValueSetDimension = {
  id: string;
  label: string;
  areaId?: string;
  metricId?: string;
  metricIds?: string[];
  metricPattern?: string;
  aggregation?: AreaAggregation;
  direction: ValueSetDirection;
  weight: number;
  min?: number;
  max?: number;
  target?: number;
  guardrailMin?: number;
  guardrailMax?: number;
  guardrailPenalty?: number;
};

export type ValueSet = {
  id: string;
  name: string;
  description?: string;
  dimensions: ValueSetDimension[];
  eventRules?: ValueSetEventRule[];
  mergeRatio?: {
    trajectory: number;
    events: number;
  };
  createdAt: string;
  updatedAt: string;
  isPreset?: boolean;
};

export type ValueSetEventRule = {
  id: string;
  label: string;
  tag: string;
  direction: "prefer" | "avoid";
  weight: number;
  targetCount?: number;
};

export type ValueSetDimensionEvaluation = {
  dimensionId: string;
  label: string;
  weight: number;
  rawValue: number | null;
  normalizedScore: number;
  weightedScore: number;
  reasons: string[];
};

export type ValueSetEvaluation = {
  valueSetId: string;
  valueSetName: string;
  score: number;
  scorePct: number;
  trajectoryScore?: number;
  trajectoryScorePct?: number;
  eventScore?: number;
  eventScorePct?: number;
  mergeRatio?: {
    trajectory: number;
    events: number;
  };
  confidence: "low" | "medium" | "high";
  dimensionResults: ValueSetDimensionEvaluation[];
  eventResults?: ValueSetEventRuleEvaluation[];
  topDrivers: string[];
  generatedAt: string;
};

export type ValueSetEventRuleEvaluation = {
  ruleId: string;
  label: string;
  tag: string;
  weight: number;
  observedCount: number;
  normalizedScore: number;
  weightedScore: number;
  direction: "prefer" | "avoid";
};

// Backward-compatible aliases (pre-factor refactor).
export type MetricId = FactorId;
export type MetricDefinition = Omit<FactorDefinition, "type" | "enabled"> & {
  unit: string;
  enabled?: boolean;
  description?: string;
};
export type MetricValue = FactorSnapshot;
