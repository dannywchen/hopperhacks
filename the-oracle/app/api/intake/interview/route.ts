import { NextResponse } from "next/server";
import { interviewDomainById } from "@/lib/onboarding/config";
import {
  interviewRequestSchema,
  mockInterviewResponse,
  normalizeInterviewMessages,
  reflectionCoverageMap,
} from "@/lib/onboarding/interview";
import type { OnboardingDomainReflection } from "@/lib/types";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to generate interview follow-up.";
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsed = interviewRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid interview payload." }, { status: 400 });
    }

    const body = parsed.data;
    const messages = normalizeInterviewMessages(body.messages ?? []);
    const previousReflections = (body.previousReflections ?? []) as OnboardingDomainReflection[];

    if (messages.length === 0) {
      const seedDomain = interviewDomainById("decision_archaeology");
      const seedQuestion = seedDomain.questionBank[0]?.prompt ?? seedDomain.starterQuestion;
      return NextResponse.json({
        nextPrompt: {
          domainId: seedDomain.id,
          question: seedQuestion,
          action: "advance_domain",
          rationale: "Start with life narrative to establish baseline context.",
          shouldSuggestSimulate: false,
        },
        reflections: previousReflections,
        coverage: reflectionCoverageMap(previousReflections),
        meta: {
          mode: "heuristic",
          provider: "local",
          usedFallback: false,
        },
      });
    }

    const mock = mockInterviewResponse({
      lifeStory: body.lifeStory,
      resumeText: body.resumeText,
      messages,
      previousReflections,
    });

    return NextResponse.json({
      ...mock,
      coverage: reflectionCoverageMap(mock.reflections),
      meta: {
        mode: "heuristic",
        provider: "local",
        usedFallback: false,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: errorMessage(error),
      },
      { status: 500 },
    );
  }
}
