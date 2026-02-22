import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { advanceManualSimulation } from "@/lib/simulation-engine";

const stepSchema = z.object({
  optionId: z.string().min(1).max(120).optional(),
  customAction: z.string().min(2).max(220).optional(),
});

type RouteParams = {
  params: Promise<{ simulationId: string }>;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to process simulation step.";
}

export async function POST(req: Request, context: RouteParams) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = stepSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid step payload." }, { status: 400 });
    }

    if (!parsed.data.optionId && !parsed.data.customAction) {
      return NextResponse.json(
        { error: "Provide either optionId or customAction." },
        { status: 400 },
      );
    }

    const { simulationId } = await context.params;
    const result = await advanceManualSimulation({
      profileId: user.id,
      simulationId,
      optionId: parsed.data.optionId,
      customAction: parsed.data.customAction,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = errorMessage(error);
    const status =
      message.includes("not found") || message.includes("No baseline")
        ? 404
        : message.includes("Only manual simulations") || message.includes("ended")
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
