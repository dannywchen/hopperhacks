import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { endSimulation } from "@/lib/simulation-engine";

type RouteParams = {
  params: Promise<{ simulationId: string }>;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to end simulation.";
}

export async function POST(req: Request, context: RouteParams) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { simulationId } = await context.params;
    const result = await endSimulation({
      profileId: user.id,
      simulationId,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = errorMessage(error);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
