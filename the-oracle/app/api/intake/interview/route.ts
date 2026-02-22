import { NextResponse } from "next/server";
import { INTERVIEW_DOMAINS, interviewDomainById } from "@/lib/onboarding/config";
import {
  estimateSimulationAccuracy,
  interviewReflectionLayerSchema,
  interviewRequestSchema,
  interviewStrategistLayerSchema,
  mockInterviewResponse,
  mergeReflections,
  normalizeInterviewMessages,
  reflectionCoverageMap,
} from "@/lib/onboarding/interview";
import type {
  OnboardingDomainReflection,
  OnboardingInterviewDomainId,
  OnboardingInterviewMessage,
} from "@/lib/types";
import { getAuthUser } from "@/lib/auth";
import { saveAgentMemory } from "@/lib/game-db";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUIRED_GEMINI_MODEL = "gemini-3-flash-preview";

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type InterviewTurnResult = {
  nextPrompt: {
    domainId: OnboardingInterviewDomainId;
    question: string;
    action: "follow_up" | "advance_domain";
    rationale: string;
    shouldSuggestSimulate: boolean;
  };
  reflections: OnboardingDomainReflection[];
  provider: "gemini" | "local";
  model?: string;
};

function generateInterviewTurnLocally(input: {
  resumeText?: string | null;
  lifeStory?: string | null;
  messages: OnboardingInterviewMessage[];
  previousReflections: OnboardingDomainReflection[];
}): InterviewTurnResult {
  const fallback = mockInterviewResponse({
    resumeText: input.resumeText,
    lifeStory: input.lifeStory,
    messages: input.messages,
    previousReflections: input.previousReflections,
  });

  return {
    nextPrompt: fallback.nextPrompt,
    reflections: fallback.reflections,
    provider: "local",
  };
}

type LatestAnswerAssessment = {
  isTooShort: boolean;
  isLikelyOffTopic: boolean;
  wordCount: number;
  charCount: number;
  overlapCount: number;
  reason: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to generate interview follow-up.";
}

function sanitizeText(text: string, maxChars = 600) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function transcript(messages: OnboardingInterviewMessage[]) {
  return messages
    .slice(-24)
    .map((message, index) => {
      const role = message.role === "assistant" ? "Interviewer" : "Candidate";
      const domain = message.domainId ? ` [${message.domainId}]` : "";
      return `${index + 1}. ${role}${domain}: ${sanitizeText(message.content, 900)}`;
    })
    .join("\n");
}

function domainCatalog() {
  return INTERVIEW_DOMAINS.map((domain) => {
    const sampleQuestions = domain.questionBank
      .slice(0, 3)
      .map((question) => question.prompt)
      .join(" | ");
    return [
      `- id: ${domain.id}`,
      `  label: ${domain.label}`,
      `  starterQuestion: ${domain.starterQuestion}`,
      `  followUpQuestion: ${domain.followUpQuestion}`,
      `  keywords: ${domain.keywords.join(", ")}`,
      `  sampleQuestions: ${sampleQuestions}`,
    ].join("\n");
  }).join("\n\n");
}

function extractJsonObject(rawText: string) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1).trim();
  }

  return rawText.trim();
}

function safeParseInterviewJson(rawText: string): {
  reflections?: unknown;
  nextPrompt?: unknown;
} {
  const candidate = extractJsonObject(rawText)
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .trim();
  try {
    return JSON.parse(candidate) as {
      reflections?: unknown;
      nextPrompt?: unknown;
    };
  } catch (firstError) {
    const sanitized = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u0019]+/g, " ");
    try {
      return JSON.parse(sanitized) as {
        reflections?: unknown;
        nextPrompt?: unknown;
      };
    } catch {
      throw firstError;
    }
  }
}

async function requestGeminiCandidateText(params: {
  model: string;
  apiKey: string;
  prompt: string;
}): Promise<string> {
  const response = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: params.prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1400,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as GeminiGenerateResponse | null;

  if (!response.ok) {
    const detail = payload?.error?.message || `Gemini request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  const candidateText = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? "")
    .join("")
    .trim();
  if (!candidateText) {
    throw new Error("Gemini returned an empty response.");
  }
  return candidateText;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function assessLatestAnswer(messages: OnboardingInterviewMessage[]): LatestAnswerAssessment {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const answer = latestUser?.content ?? "";
  const question = latestAssistant?.content ?? "";
  const answerTokens = tokenize(answer);
  const questionTokens = tokenize(question);
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "your",
  ]);
  const answerKeywords = new Set(answerTokens.filter((token) => !stopwords.has(token)));
  const questionKeywords = questionTokens.filter((token) => !stopwords.has(token));
  const overlapCount = questionKeywords.reduce(
    (count, token) => (answerKeywords.has(token) ? count + 1 : count),
    0,
  );
  const isTooShort = answerTokens.length > 0 && (answerTokens.length < 6 || answer.trim().length < 25);
  const isLikelyOffTopic =
    questionKeywords.length >= 4 && answerTokens.length >= 3 && overlapCount === 0;

  let reason = "Answer appears substantive and related.";
  if (isTooShort && isLikelyOffTopic) {
    reason = "Answer is both brief and likely off-topic.";
  } else if (isTooShort) {
    reason = "Answer is too brief for evidence-based reflection.";
  } else if (isLikelyOffTopic) {
    reason = "Answer appears weakly related to the interviewer question.";
  }

  return {
    isTooShort,
    isLikelyOffTopic,
    wordCount: answerTokens.length,
    charCount: answer.trim().length,
    overlapCount,
    reason,
  };
}

async function generateInterviewTurnWithGemini(input: {
  resumeText?: string | null;
  lifeStory?: string | null;
  simulationMode?: "auto_future" | "manual_step";
  simulationIntents?: string[];
  messages: OnboardingInterviewMessage[];
  previousReflections: OnboardingDomainReflection[];
}): Promise<InterviewTurnResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const model = REQUIRED_GEMINI_MODEL;
  const answerAssessment = assessLatestAnswer(input.messages);
  const basePrompt = [
    "You are an adaptive onboarding interviewer.",
    "Goal: ask the single best next interview question while updating focus-area reflections.",
    "Use all provided context. Every reply must include a brief reaction to the candidate answer and then one follow-up question.",
    "",
    "Rules:",
    "- Output JSON only, no markdown, no prose outside JSON.",
    "- Choose domainId from the allowed domain catalog.",
    "- Prefer following up on weak/missing focus areas.",
    "- nextPrompt.question must be 2-3 sentences total.",
    "- Sentence 1-2: concise reaction to what the candidate said (not generic filler).",
    "- Final sentence: exactly one follow-up question ending with '?'.",
    "- If latest answer is short/vague/off-topic, set action=follow_up and ask the candidate to answer the same core question with specifics.",
    "- If latest answer is short/off-topic, keep same domainId as the latest assistant question domain unless impossible.",
    "- coverage is 0-100 and should rise as evidence improves.",
    "- shouldSuggestSimulate becomes true only when enough coverage exists across domains.",
    "",
    "Required JSON shape:",
    "{",
    '  "nextPrompt": {',
    '    "domainId": "decision_archaeology | stress_response | habits_rhythm | health | relationships | money",',
    '    "question": "...",',
    '    "action": "follow_up | advance_domain",',
    '    "rationale": "...",',
    '    "shouldSuggestSimulate": true',
    "  },",
    '  "reflections": [',
    "    {",
    '      "domainId": "...",',
    '      "summary": "...",',
    '      "coverage": 0,',
    '      "confidence": "low | medium | high",',
    '      "evidence": ["..."]',
    "    }",
    "  ]",
    "}",
    "",
    "Domain catalog:",
    domainCatalog(),
    "",
    "Simulation intents:",
    JSON.stringify(input.simulationIntents ?? []),
    "",
    "Simulation mode:",
    input.simulationMode ?? "manual_step",
    "",
    "Previous reflections JSON:",
    JSON.stringify(input.previousReflections ?? []),
    "",
    "Resume text (optional):",
    sanitizeText(input.resumeText ?? "", 4000),
    "",
    "Life story aggregate (optional):",
    sanitizeText(input.lifeStory ?? "", 4000),
    "",
    "Conversation transcript:",
    transcript(input.messages),
    "",
    "Latest answer quality signal:",
    JSON.stringify(answerAssessment),
  ].join("\n");

  let parsedJson: { reflections?: unknown; nextPrompt?: unknown } | null = null;
  let parseError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nImportant: Your previous output was invalid JSON. Return a single valid JSON object only.`;
    const candidateText = await requestGeminiCandidateText({
      model,
      apiKey,
      prompt,
    });
    try {
      parsedJson = safeParseInterviewJson(candidateText);
      parseError = null;
      break;
    } catch (error) {
      parseError = error;
    }
  }
  if (!parsedJson) {
    throw parseError instanceof Error
      ? parseError
      : new Error("Gemini response JSON parsing failed.");
  }

  const reflectionBundle = interviewReflectionLayerSchema.parse({
    reflections: parsedJson.reflections ?? [],
  });
  const nextPrompt = interviewStrategistLayerSchema.parse(parsedJson.nextPrompt ?? {});

  const mergedReflections = mergeReflections(
    input.previousReflections,
    reflectionBundle.reflections,
  );

  return {
    nextPrompt,
    reflections: mergedReflections,
    provider: "gemini",
    model,
  };
}

async function persistInterviewProgress(params: {
  profileId: string;
  messages: OnboardingInterviewMessage[];
  reflections: OnboardingDomainReflection[];
  nextQuestion: string;
  lifeStory?: string | null;
  resumeText?: string | null;
}) {
  try {
    const latestUserMessage = [...params.messages]
      .reverse()
      .find((message) => message.role === "user");
    const coverage = reflectionCoverageMap(params.reflections);
    const turnKeySuffix = (latestUserMessage?.id ?? Date.now().toString())
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(-28);

    const writes = [
      saveAgentMemory({
        profile_id: params.profileId,
        category: "onboarding_interview",
        key: "onboarding_interview_progress",
        content: [
          `updated_at=${new Date().toISOString()}`,
          `next_question=${sanitizeText(params.nextQuestion, 260)}`,
          ...INTERVIEW_DOMAINS.map((domain) => `${domain.id}=${coverage[domain.id] ?? 0}`),
        ].join("\n"),
        importance: 90,
      }),
      saveAgentMemory({
        profile_id: params.profileId,
        category: "onboarding_interview",
        key: "onboarding_context_latest",
        content: JSON.stringify({
          updatedAt: new Date().toISOString(),
          resumeText: sanitizeText(params.resumeText ?? "", 2800),
          lifeStory: sanitizeText(params.lifeStory ?? "", 2800),
          reflectionCount: params.reflections.length,
          messageCount: params.messages.length,
        }),
        importance: 86,
      }),
      saveAgentMemory({
        profile_id: params.profileId,
        category: "onboarding_interview",
        key: "onboarding_conversation_latest",
        content: params.messages
          .slice(-40)
          .map((message) => `[${message.role}] ${sanitizeText(message.content, 500)}`)
          .join("\n"),
        importance: 92,
      }),
    ];

    const accuracy = estimateSimulationAccuracy({
      resumeText: params.resumeText ?? null,
      lifeStory: params.lifeStory ?? null,
      coverage,
    });
    writes.push(
      saveAgentMemory({
        profile_id: params.profileId,
        category: "onboarding_interview",
        key: "onboarding_focus_metrics_latest",
        content: JSON.stringify({
          updatedAt: new Date().toISOString(),
          coverage,
          simulationAccuracy: accuracy.simulationAccuracy,
          averageCoverage: accuracy.averageCoverage,
          nextQuestion: sanitizeText(params.nextQuestion, 220),
        }),
        importance: 93,
      }),
    );

    if (latestUserMessage?.content) {
      writes.push(
        saveAgentMemory({
          profile_id: params.profileId,
          category: "onboarding_interview",
          key: `onboarding_turn_${turnKeySuffix}`,
          content: sanitizeText(latestUserMessage.content, 2000),
          importance: 74,
        }),
      );
    }

    await Promise.allSettled(writes);
  } catch {
    // Non-blocking persistence: interview should continue even if memory storage is unavailable.
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsed = interviewRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid interview payload." }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          meta: {
            hasAuthorizationHeader: Boolean(authHeader?.startsWith("Bearer ")),
          },
        },
        { status: 401 },
      );
    }

    const body = parsed.data;
    const messages = normalizeInterviewMessages(body.messages ?? []);
    const previousReflections = (body.previousReflections ?? []) as OnboardingDomainReflection[];

    if (messages.length === 0) {
      const seedDomain = interviewDomainById("decision_archaeology");
      const seedMessage: OnboardingInterviewMessage = {
        id: `seed-${Date.now()}`,
        role: "assistant",
        content: seedDomain.starterQuestion,
        createdAt: new Date().toISOString(),
        domainId: seedDomain.id,
      };
      let seedTurn: InterviewTurnResult;
      let usedFallback = false;
      try {
        seedTurn = await generateInterviewTurnWithGemini({
          resumeText: body.resumeText,
          lifeStory: body.lifeStory,
          simulationMode: body.simulationMode,
          simulationIntents: body.simulationIntents,
          messages: [seedMessage],
          previousReflections,
        });
      } catch (error) {
        console.warn("Gemini seed turn failed; using local fallback.", error);
        seedTurn = generateInterviewTurnLocally({
          resumeText: body.resumeText,
          lifeStory: body.lifeStory,
          messages: [seedMessage],
          previousReflections,
        });
        usedFallback = true;
      }
      return NextResponse.json({
        nextPrompt: seedTurn.nextPrompt,
        reflections: seedTurn.reflections,
        coverage: reflectionCoverageMap(seedTurn.reflections),
        meta: {
          mode: usedFallback ? "local_seed_fallback" : "llm_seed",
          provider: seedTurn.provider,
          model: seedTurn.model,
          usedFallback,
        },
      });
    }

    let turn: InterviewTurnResult;
    let usedFallback = false;
    try {
      turn = await generateInterviewTurnWithGemini({
        resumeText: body.resumeText,
        lifeStory: body.lifeStory,
        simulationMode: body.simulationMode,
        simulationIntents: body.simulationIntents,
        messages,
        previousReflections,
      });
    } catch (error) {
      console.warn("Gemini turn failed; using local fallback.", error);
      turn = generateInterviewTurnLocally({
        resumeText: body.resumeText,
        lifeStory: body.lifeStory,
        messages,
        previousReflections,
      });
      usedFallback = true;
    }

    await persistInterviewProgress({
      profileId: user.id,
      messages,
      reflections: turn.reflections,
      nextQuestion: turn.nextPrompt.question,
      lifeStory: body.lifeStory ?? null,
      resumeText: body.resumeText ?? null,
    });

    return NextResponse.json({
      nextPrompt: turn.nextPrompt,
      reflections: turn.reflections,
      coverage: reflectionCoverageMap(turn.reflections),
      meta: {
        mode: usedFallback ? "local_fallback" : "llm",
        provider: turn.provider,
        model: turn.model,
        usedFallback,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: errorMessage(error),
        meta: {
          mode: "llm_error",
          provider: "gemini",
          model: REQUIRED_GEMINI_MODEL,
          usedFallback: false,
        },
      },
      { status: 503 },
    );
  }
}
