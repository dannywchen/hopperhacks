import { NextResponse } from "next/server";
import { z } from "zod";
import { horizonPresetToYears } from "@/lib/onboarding/config";
import { estimateSimulationAccuracy, reflectionCoverageMap } from "@/lib/onboarding/interview";
import { getAuthUser } from "@/lib/auth";
import { ensureUserBootstrap, saveAgentMemory, saveUserSetup } from "@/lib/game-db";
import {
  ensureInitialSimulation,
  inferSimulationDefaultsFromOnboarding,
} from "@/lib/simulation-engine";
import type {
  OnboardingInterviewDomainId,
  OnboardingSnapshot,
  SimulationMode,
  UserFactor,
  UserSetup,
} from "@/lib/types";

const careerPayloadSchema = z.object({
  text: z.string().optional(),
  onboarding: z
    .object({
      avatar: z.object({
        spriteId: z.string(),
        paletteId: z.string(),
        accessory: z.enum(["none", "cap", "headphones", "glasses", "star"]),
        expression: z.enum(["calm", "smile", "focused", "curious"]),
      }),
      resumeText: z.string().nullable().optional(),
      linkedinProfile: z
        .object({
          source: z.enum(["apify", "resume"]),
          profileUrl: z.string(),
          scrapedAt: z.string(),
          fullName: z.string().optional(),
          headline: z.string().optional(),
          location: z.string().optional(),
          about: z.string().optional(),
          experiences: z.array(z.string()).optional(),
          projects: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          education: z.array(z.string()).optional(),
          certifications: z.array(z.string()).optional(),
        })
        .nullable()
        .optional(),
      lifeStory: z.string().nullable().optional(),
      interviewMessages: z
        .array(
          z.object({
            id: z.string().optional(),
            role: z.enum(["assistant", "user"]),
            content: z.string(),
            createdAt: z.string().optional(),
            domainId: z
              .enum([
                "decision_archaeology",
                "stress_response",
                "habits_rhythm",
                "health",
                "relationships",
                "money",
              ])
              .optional(),
          }),
        )
        .optional(),
      reflections: z
        .array(
          z.object({
            domainId: z.enum([
              "decision_archaeology",
              "stress_response",
              "habits_rhythm",
              "health",
              "relationships",
              "money",
            ]),
            summary: z.string(),
            coverage: z.number(),
            confidence: z.enum(["low", "medium", "high"]),
            evidence: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      simulationHorizonPreset: z
        .enum(["whole_life", "10_years", "1_year", "1_week"])
        .optional(),
      simulationMode: z.enum(["auto_future", "manual_step"]).optional(),
      simulationIntents: z
        .array(
          z.enum([
            "career_path",
            "future_timeline",
            "fun",
            "planning",
            "what_if",
            "continue_path",
            "achieve_goal",
          ]),
        )
        .optional(),
      targetOutcome: z.string().nullable().optional(),
    })
    .optional(),
});

const LEGACY_MANUAL_INTENTS = new Set([
  "career_path",
  "what_if",
  "achieve_goal",
]);

function inferSimulationMode(params: {
  explicitMode?: SimulationMode;
  legacyIntents?: string[] | undefined;
}): SimulationMode {
  if (params.explicitMode) return params.explicitMode;
  const intents = params.legacyIntents ?? [];
  if (intents.some((intent) => LEGACY_MANUAL_INTENTS.has(intent))) {
    return "manual_step";
  }
  return "auto_future";
}

function cleanText(value: unknown, maxChars = 1600) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to build onboarding setup.";
}

function inferName(params: {
  linkedinName?: string | null;
  resumeText?: string | null;
  fallbackText?: string | null;
}) {
  const linkedinName = cleanText(params.linkedinName, 120);
  if (linkedinName) return linkedinName;

  const firstLine = String(params.resumeText ?? "").split("\n")[0]?.trim() ?? "";
  if (/^[A-Za-z][A-Za-z\s.'-]{1,70}$/.test(firstLine)) return firstLine;

  const fromText = String(params.fallbackText ?? "")
    .match(/\bmy name is\s+([A-Za-z][A-Za-z\s'-]{1,40})/i)?.[1]
    ?.trim();
  if (fromText) return fromText;

  return "Player";
}

function inferOccupation(params: {
  headline?: string | null;
  resumeText?: string | null;
  fallbackText?: string | null;
}) {
  const headline = cleanText(params.headline, 180);
  if (headline) return headline;

  const resume = String(params.resumeText ?? "");
  const roleHit = resume.match(
    /(software engineer|product manager|data scientist|designer|founder|marketer|analyst)/i,
  );
  if (roleHit?.[1]) return roleHit[1];

  const text = String(params.fallbackText ?? "");
  if (/student/i.test(text)) return "Student";
  return "Builder";
}

function coverageAverage(reflections: OnboardingSnapshot["reflections"]) {
  if (reflections.length === 0) return 0;
  const total = reflections.reduce((sum, reflection) => sum + Math.max(0, reflection.coverage), 0);
  return Math.round(total / reflections.length);
}

function baselineFactors(snapshot: OnboardingSnapshot): UserFactor[] {
  const coverage = coverageAverage(snapshot.reflections);
  const qualityBoost = Math.min(20, Math.round(snapshot.lifeStory.length / 800));
  const modeBoost = snapshot.simulationMode === "manual_step" ? 4 : 0;
  const base = Math.max(35, Math.min(88, 42 + Math.round(coverage * 0.35) + qualityBoost));

  const moneyBase = Math.max(
    25,
    Math.min(90, base + (snapshot.simulationMode === "manual_step" ? 5 : 2)),
  );
  const healthBase = Math.max(20, Math.min(90, base - (snapshot.simulationMode === "auto_future" ? 2 : 4)));
  const relationshipsBase = Math.max(20, Math.min(90, base + modeBoost));

  return [
    {
      id: "health",
      label: "Health",
      type: "score",
      unit: "/100",
      description: "Composite of energy, habits, and resilience.",
      enabled: true,
      baseline: { value: healthBase, source: "self_report", confidence: "medium" },
    },
    {
      id: "money",
      label: "Money",
      type: "score",
      unit: "/100",
      description: "Financial stability and flexibility.",
      enabled: true,
      baseline: { value: moneyBase, source: "self_report", confidence: "medium" },
    },
    {
      id: "career",
      label: "Career",
      type: "score",
      unit: "/100",
      description: "Career momentum and optionality.",
      enabled: true,
      baseline: { value: base, source: "self_report", confidence: "medium" },
    },
    {
      id: "relationships",
      label: "Relationships",
      type: "score",
      unit: "/100",
      description: "Support, trust, and relationship health.",
      enabled: true,
      baseline: { value: relationshipsBase, source: "self_report", confidence: "medium" },
    },
    {
      id: "fulfillment",
      label: "Fulfillment",
      type: "score",
      unit: "/100",
      description: "Meaning, purpose, and personal alignment.",
      enabled: true,
      baseline: { value: Math.max(20, Math.min(95, base + 2)), source: "self_report", confidence: "low" },
    },
    {
      id: "lifeExpectancy",
      label: "Projected Death Age",
      type: "quantity",
      unit: "years",
      description: "Early estimate refined by future simulation runs.",
      enabled: true,
      baseline: {
        value: 76 + Math.round((healthBase - 50) / 8),
        source: "self_report",
        confidence: "low",
      },
    },
    {
      id: "netWorthTotal",
      label: "Net Worth",
      type: "quantity",
      unit: "USD",
      description: "Estimated current total net worth baseline.",
      enabled: true,
      baseline: {
        value: Math.max(0, 20000 + (moneyBase - 40) * 3000),
        source: "self_report",
        confidence: "low",
      },
    },
  ];
}

function toSnapshot(
  payload: z.infer<typeof careerPayloadSchema>["onboarding"],
): OnboardingSnapshot | undefined {
  if (!payload) return undefined;
  const now = new Date().toISOString();
  const linkedinProfile = payload.linkedinProfile
    ? {
      source: payload.linkedinProfile.source as "apify" | "resume",
      profileUrl: payload.linkedinProfile.profileUrl,
      scrapedAt: payload.linkedinProfile.scrapedAt,
      ...(payload.linkedinProfile.fullName ? { fullName: payload.linkedinProfile.fullName } : {}),
      ...(payload.linkedinProfile.headline ? { headline: payload.linkedinProfile.headline } : {}),
      ...(payload.linkedinProfile.location ? { location: payload.linkedinProfile.location } : {}),
      ...(payload.linkedinProfile.about ? { about: payload.linkedinProfile.about } : {}),
      experiences: payload.linkedinProfile.experiences ?? [],
      projects: payload.linkedinProfile.projects ?? [],
      skills: payload.linkedinProfile.skills ?? [],
      education: payload.linkedinProfile.education ?? [],
      certifications: payload.linkedinProfile.certifications ?? [],
    }
    : undefined;

  return {
    version: "v1",
    completedAt: now,
    avatar: payload.avatar,
    ...(cleanText(payload.resumeText, 26000) ? { resumeText: cleanText(payload.resumeText, 26000) } : {}),
    ...(linkedinProfile ? { linkedinProfile } : {}),
    lifeStory: cleanText(payload.lifeStory, 26000),
    interviewMessages: (payload.interviewMessages ?? []).map((message) => ({
      id: message.id?.trim() || crypto.randomUUID(),
      role: message.role,
      content: cleanText(message.content, 700),
      createdAt: message.createdAt?.trim() || now,
      ...(message.domainId ? { domainId: message.domainId } : {}),
    })),
    reflections: (payload.reflections ?? []).map((reflection) => ({
      domainId: reflection.domainId,
      summary: cleanText(reflection.summary, 600),
      coverage: Math.max(0, Math.min(100, Math.round(reflection.coverage))),
      confidence: reflection.confidence,
      evidence: (reflection.evidence ?? []).map((entry) => cleanText(entry, 220)).filter(Boolean),
    })),
    simulationMode: inferSimulationMode({
      explicitMode: payload.simulationMode,
      legacyIntents: payload.simulationIntents,
    }),
    simulationHorizonPreset: payload.simulationHorizonPreset ?? "10_years",
    ...(cleanText(payload.targetOutcome, 1200)
      ? { targetOutcome: cleanText(payload.targetOutcome, 1200) }
      : {}),
  };
}

export async function POST(req: Request) {
  let stage = "parse_request";
  try {
    const raw = await req.json().catch(() => ({}));
    stage = "validate_payload";
    const parsed = careerPayloadSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid onboarding payload." }, { status: 400 });
    }

    stage = "authenticate_user";
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    stage = "build_setup_payload";
    const { text = "", onboarding } = parsed.data;
    const snapshot = toSnapshot(onboarding);
    const now = new Date().toISOString();

    const profileName = inferName({
      linkedinName: onboarding?.linkedinProfile?.fullName,
      resumeText: onboarding?.resumeText,
      fallbackText: text,
    });

    const occupation = inferOccupation({
      headline: onboarding?.linkedinProfile?.headline,
      resumeText: onboarding?.resumeText,
      fallbackText: text,
    });

    const location = cleanText(onboarding?.linkedinProfile?.location, 120) || undefined;
    const simulationMode = inferSimulationMode({
      explicitMode: onboarding?.simulationMode,
      legacyIntents: onboarding?.simulationIntents as string[] | undefined,
    });
    const horizonYears = horizonPresetToYears(onboarding?.simulationHorizonPreset ?? "10_years");

    const setup: UserSetup = {
      version: "v4",
      createdAt: now,
      updatedAt: now,
      profile: {
        name: profileName,
        occupation,
        ...(location ? { location } : {}),
      },
      model: {
        version: "career-v1",
        variables: {
          career_momentum: {
            id: "career_momentum",
            label: "Career Momentum",
            unit: "index",
            kind: "scalar",
            value: 50,
            min: 0,
            max: 100,
            confidence: "low",
            source: "derived",
            updatedAt: now,
            rationale: "Seeded from onboarding narrative and imported signals.",
          },
          stress_tolerance: {
            id: "stress_tolerance",
            label: "Stress Tolerance",
            unit: "index",
            kind: "scalar",
            value: 50,
            min: 0,
            max: 100,
            confidence: "low",
            source: "derived",
            updatedAt: now,
            rationale: "Initialized from interview coverage and qualitative reflections.",
          },
        },
      },
      factors: baselineFactors(
        snapshot ?? {
          version: "v1",
          completedAt: now,
          avatar: {
            spriteId: "v3|head:beige|hair:short-brown|outfit:blue-guard",
            paletteId: "plum",
            accessory: "none",
            expression: "calm",
          },
          lifeStory: cleanText(text, 2000),
          interviewMessages: [],
          reflections: [],
          simulationMode,
          simulationHorizonPreset: "10_years",
        },
      ),
      lovedOnes: [],
      preferences: {
        horizonYears,
        simulationMode,
        includeLongevity: true,
        includeLovedOnesLongevity: false,
      },
      ...(snapshot ? { onboarding: snapshot } : {}),
    };

    stage = "bootstrap_user";
    await ensureUserBootstrap(user.id);
    stage = "save_user_setup";
    await saveUserSetup(user.id, setup);

    let memoryWriteWarning: string | null = null;
    if (snapshot) {
      const coverageMap = reflectionCoverageMap(snapshot.reflections);
      const accuracy = estimateSimulationAccuracy({
        resumeText: snapshot.resumeText ?? null,
        lifeStory: snapshot.lifeStory ?? null,
        coverage: coverageMap as Record<OnboardingInterviewDomainId, number>,
      });
      const writes = [
        saveAgentMemory({
          profile_id: user.id,
          category: "onboarding_interview",
          key: "onboarding_snapshot",
          content: JSON.stringify({
            updatedAt: now,
            interviewMessageCount: snapshot.interviewMessages.length,
            reflectionCount: snapshot.reflections.length,
            simulationMode: snapshot.simulationMode,
            simulationHorizonPreset: snapshot.simulationHorizonPreset,
            lifeStory: cleanText(snapshot.lifeStory, 2400),
            reflections: snapshot.reflections.slice(0, 8),
          }),
          importance: 95,
        }),
        saveAgentMemory({
          profile_id: user.id,
          category: "onboarding_interview",
          key: "onboarding_focus_metrics_latest",
          content: JSON.stringify({
            updatedAt: now,
            coverage: coverageMap,
            simulationAccuracy: accuracy.simulationAccuracy,
            averageCoverage: accuracy.averageCoverage,
          }),
          importance: 93,
        }),
      ];

      if (snapshot.resumeText) {
        writes.push(
          saveAgentMemory({
            profile_id: user.id,
            category: "onboarding_intake",
            key: "onboarding_resume_latest",
            content: cleanText(snapshot.resumeText, 12_000),
            importance: 90,
          }),
        );
      }

      if (snapshot.lifeStory) {
        writes.push(
          saveAgentMemory({
            profile_id: user.id,
            category: "onboarding_intake",
            key: "onboarding_manual_context_latest",
            content: cleanText(snapshot.lifeStory, 12_000),
            importance: 88,
          }),
        );
      }

      if (snapshot.interviewMessages.length > 0) {
        writes.push(
          saveAgentMemory({
            profile_id: user.id,
            category: "onboarding_interview",
            key: "onboarding_conversation_latest",
            content: snapshot.interviewMessages
              .slice(-28)
              .map((message) => `[${message.role}] ${cleanText(message.content, 500)}`)
              .join("\n"),
            importance: 91,
          }),
        );
      }

      stage = "save_agent_memory";
      try {
        await Promise.all(writes);
      } catch (memoryError: unknown) {
        console.error("Unable to save onboarding memory snapshot:", memoryError);
        memoryWriteWarning =
          memoryError instanceof Error
            ? memoryError.message
            : "Memory snapshot write failed.";
      }
    }

    stage = "provision_initial_simulation";
    const defaults = inferSimulationDefaultsFromOnboarding(snapshot);
    let initialSimulationId: string | null = null;
    let simulationProvisioningWarning: string | null = null;

    try {
      const initialSimulation = await ensureInitialSimulation({
        profileId: user.id,
        setup,
      });
      initialSimulationId = initialSimulation.run.id;
    } catch (simulationError: unknown) {
      console.error("Unable to provision initial simulation during onboarding:", simulationError);
      simulationProvisioningWarning =
        simulationError instanceof Error
          ? simulationError.message
          : "Simulation provisioning failed.";
    }

    const notes = [
      "Generated baseline setup from onboarding intake.",
      initialSimulationId
        ? "Created your first simulation run from onboarding context."
        : "Profile setup saved. Create your first simulation from the dashboard.",
    ];
    if (memoryWriteWarning) {
      notes.push(
        "Onboarding memory write had a compatibility warning. Core onboarding data is still saved.",
      );
    }
    if (simulationProvisioningWarning) {
      notes.push(
        "Simulation provisioning is not ready yet. Run the latest Supabase migration, then create a simulation.",
      );
    }

    return NextResponse.json({
      setup,
      notes,
      meta: {
        mode: defaults.mode,
        horizonYears,
        simulationId: initialSimulationId,
        memoryWriteWarning,
        simulationProvisioningWarning,
      },
    });
  } catch (error: unknown) {
    console.error(`[api/intake/career] failed at stage=${stage}`, error);
    const message = errorMessage(error);
    return NextResponse.json(
      {
        error: `${message} (stage: ${stage})`,
        stage,
      },
      { status: 500 },
    );
  }
}
