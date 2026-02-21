import { z } from "zod";
import {
  INTERVIEW_DOMAINS,
  interviewDomainById,
  type InterviewDomainDefinition,
} from "@/lib/onboarding/config";
import type {
  OnboardingDomainReflection,
  OnboardingInterviewDomainId,
  OnboardingInterviewMessage,
} from "@/lib/types";

const DOMAIN_IDS = INTERVIEW_DOMAINS.map((domain) => domain.id) as [
  OnboardingInterviewDomainId,
  ...OnboardingInterviewDomainId[],
];

export const interviewRequestSchema = z.object({
  resumeText: z.string().nullable().optional(),
  lifeStory: z.string().nullable().optional(),
  targetRole: z.string().nullable().optional(),
  simulationIntents: z.array(z.string()).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["assistant", "user"]),
        content: z.string(),
        createdAt: z.string().optional(),
        domainId: z.enum(DOMAIN_IDS).nullable().optional(),
      }),
    )
    .max(120)
    .optional(),
  previousReflections: z
    .array(
      z.object({
        domainId: z.enum(DOMAIN_IDS),
        summary: z.string(),
        coverage: z.number(),
        confidence: z.enum(["low", "medium", "high"]),
        evidence: z.array(z.string()).optional(),
      }),
    )
    .max(24)
    .optional(),
});

export type InterviewRequestPayload = z.infer<typeof interviewRequestSchema>;

export const interviewReflectionLayerSchema = z.object({
  reflections: z
    .array(
      z.object({
        domainId: z.enum(DOMAIN_IDS),
        summary: z.string(),
        coverage: z.number().min(0).max(100),
        confidence: z.enum(["low", "medium", "high"]),
        evidence: z.array(z.string()).default([]),
      }),
    ),
  keyFacts: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
});

export const interviewStrategistLayerSchema = z.object({
  domainId: z.enum(DOMAIN_IDS),
  question: z.string().min(5),
  action: z.enum(["follow_up", "advance_domain"]),
  rationale: z.string(),
  shouldSuggestSimulate: z.boolean(),
});

function normalizeMessage(
  message: NonNullable<InterviewRequestPayload["messages"]>[number],
): OnboardingInterviewMessage {
  return {
    id: message.id?.trim() || crypto.randomUUID(),
    role: message.role,
    content: message.content.trim(),
    createdAt: message.createdAt?.trim() || new Date().toISOString(),
    ...(message.domainId ? { domainId: message.domainId } : {}),
  };
}

function clampCoverage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function domainKeywordCount(
  domain: InterviewDomainDefinition,
  text: string,
): number {
  const haystack = text.toLowerCase();
  return domain.keywords.reduce(
    (count, keyword) => (haystack.includes(keyword) ? count + 1 : count),
    0,
  );
}

function inferDomainFromText(text: string): OnboardingInterviewDomainId {
  const scores = INTERVIEW_DOMAINS.map((domain) => ({
    domainId: domain.id,
    score: domainKeywordCount(domain, text),
  }));
  scores.sort((a, b) => b.score - a.score);
  if (scores[0]?.score > 0) {
    return scores[0].domainId;
  }
  return "habits_rhythm";
}

function compactSnippet(text: string, maxChars = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 3)}...`;
}

function questionKey(prompt: string) {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function askedAssistantQuestionKeys(messages: OnboardingInterviewMessage[]) {
  return new Set(
    messages
      .filter((message) => message.role === "assistant")
      .map((message) => questionKey(message.content)),
  );
}

function nextDomainQuestion(params: {
  domain: InterviewDomainDefinition;
  messages: OnboardingInterviewMessage[];
  preferFollowUp: boolean;
}) {
  const { domain, messages, preferFollowUp } = params;
  const asked = askedAssistantQuestionKeys(messages);
  const candidates = [
    ...domain.questionBank.map((question) => question.prompt),
    domain.starterQuestion,
    domain.followUpQuestion,
  ];
  const next = candidates.find((candidate) => !asked.has(questionKey(candidate)));
  if (next) return next;
  return preferFollowUp
    ? `${domain.followUpQuestion} Please include one concrete example from the last year.`
    : `${domain.starterQuestion} Focus on one concrete story.`;
}

function supportiveLeadIn(messages: OnboardingInterviewMessage[]) {
  const latestUserText =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    "";
  const lower = latestUserText.toLowerCase();
  if (/(overwhelm|struggl|hard|difficult|stress|anx|sad|burned out|lonely)/.test(lower)) {
    return "That sounds really heavy, and I appreciate your honesty.";
  }
  if (/(proud|excited|grateful|happy|joy|great|win|success|love)/.test(lower)) {
    return "That sounds meaningful, and I appreciate you sharing it.";
  }
  return "Thanks for sharing that.";
}

export function normalizeInterviewMessages(
  messages: InterviewRequestPayload["messages"] = [],
) {
  return messages
    .map(normalizeMessage)
    .filter((message) => message.content.length > 0)
    .slice(-100);
}

export function mockInterviewResponse(input: {
  lifeStory?: string | null;
  resumeText?: string | null;
  messages: OnboardingInterviewMessage[];
  previousReflections?: OnboardingDomainReflection[];
}) {
  const userMessages = input.messages.filter((message) => message.role === "user");
  const sourceText = [input.resumeText, input.lifeStory, ...userMessages.map((m) => m.content)]
    .filter(Boolean)
    .join("\n");

  const baselineCoverage = INTERVIEW_DOMAINS.map((domain) => {
    const keywordHits = domainKeywordCount(domain, sourceText);
    const perDomainMessages = userMessages.filter((message) => {
      const domainId = message.domainId ?? inferDomainFromText(message.content);
      return domainId === domain.id;
    });
    const lengthBoost = perDomainMessages.reduce(
      (acc, message) => acc + Math.min(22, Math.round(message.content.length / 45)),
      0,
    );
    const score = clampCoverage(keywordHits * 12 + lengthBoost);
    return {
      domain,
      score,
      messages: perDomainMessages,
    };
  });

  const reflections: OnboardingDomainReflection[] = baselineCoverage
    .filter(({ score, messages }) => score > 0 || messages.length > 0)
    .map(({ domain, score, messages }) => {
      const latestMessage = messages[messages.length - 1];
      const summarySource =
        latestMessage?.content ??
        (domainKeywordCount(domain, sourceText) > 0
          ? sourceText
          : "Not enough signal yet.");
      const confidence: OnboardingDomainReflection["confidence"] =
        score > 75 ? "high" : score > 45 ? "medium" : "low";
      const evidence = messages
        .slice(-2)
        .map((message) => compactSnippet(message.content))
        .filter(Boolean);
      return {
        domainId: domain.id,
        summary:
          score === 0
            ? "No meaningful signal captured yet."
            : compactSnippet(summarySource, 220),
        coverage: score,
        confidence,
        evidence,
      };
    });

  const mergedReflections = mergeReflections(
    input.previousReflections ?? [],
    reflections,
  );

  const weakestDomain =
    baselineCoverage.sort((a, b) => a.score - b.score)[0]?.domain ??
    INTERVIEW_DOMAINS[0];

  const shouldFollowUpSameDomain =
    userMessages.length > 0 &&
    userMessages[userMessages.length - 1].content.trim().length < 180;
  const targetDomain = shouldFollowUpSameDomain
    ? interviewDomainById(userMessages[userMessages.length - 1].domainId ?? null)
    : weakestDomain;

  const shouldSuggestSimulate =
    mergedReflections.filter((reflection) => reflection.coverage >= 40).length >= 4 ||
    userMessages.length >= 6;

  return {
    reflections: mergedReflections,
    nextPrompt: {
      domainId: targetDomain.id,
      question: `${supportiveLeadIn(input.messages)} ${nextDomainQuestion({
        domain: targetDomain,
        messages: input.messages,
        preferFollowUp: shouldFollowUpSameDomain,
      })}`,
      action: shouldFollowUpSameDomain ? "follow_up" : "advance_domain",
      rationale: shouldFollowUpSameDomain
        ? "Your latest answer was brief, so we are probing deeper."
        : `Lowest coverage area is ${targetDomain.label}.`,
      shouldSuggestSimulate,
    },
  };
}

export function mergeReflections(
  previous: OnboardingDomainReflection[],
  incoming: OnboardingDomainReflection[],
) {
  const byId = new Map<OnboardingInterviewDomainId, OnboardingDomainReflection>();
  for (const reflection of previous) {
    byId.set(reflection.domainId, {
      ...reflection,
      coverage: clampCoverage(reflection.coverage),
      evidence: (reflection.evidence ?? []).slice(0, 4),
    });
  }
  for (const reflection of incoming) {
    const existing = byId.get(reflection.domainId);
    if (!existing || reflection.coverage >= existing.coverage) {
      byId.set(reflection.domainId, {
        ...reflection,
        coverage: clampCoverage(reflection.coverage),
        evidence: (reflection.evidence ?? []).slice(0, 4),
      });
      continue;
    }
    const combinedEvidence = [...existing.evidence, ...(reflection.evidence ?? [])];
    byId.set(reflection.domainId, {
      ...existing,
      evidence: Array.from(new Set(combinedEvidence)).slice(-4),
    });
  }
  return INTERVIEW_DOMAINS.map((domain) => byId.get(domain.id)).filter(
    (reflection): reflection is OnboardingDomainReflection => Boolean(reflection),
  );
}

export function reflectionCoverageMap(reflections: OnboardingDomainReflection[]) {
  return Object.fromEntries(
    INTERVIEW_DOMAINS.map((domain) => {
      const reflection = reflections.find((item) => item.domainId === domain.id);
      return [domain.id, clampCoverage(reflection?.coverage ?? 0)];
    }),
  ) as Record<OnboardingInterviewDomainId, number>;
}
