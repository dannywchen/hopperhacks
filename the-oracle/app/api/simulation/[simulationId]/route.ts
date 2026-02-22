import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSimulationWithNodes } from "@/lib/simulation-engine";

type RouteParams = {
  params: Promise<{ simulationId: string }>;
};

function toPositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to load simulation.";
}

export async function GET(req: Request, context: RouteParams) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { simulationId } = await context.params;
    const { searchParams } = new URL(req.url);
    const nodeLimit = Math.min(600, toPositiveInt(searchParams.get("limit"), 400));
    const result = await getSimulationWithNodes({
      profileId: user.id,
      simulationId,
      nodeLimit,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = errorMessage(error);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
