import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { ensureUserBootstrap, loadUserSetup } from "@/lib/game-db";
import {
  createSimulation,
  ensureInitialSimulation,
  getSimulationWithNodes,
  listSimulations,
} from "@/lib/simulation-engine";

const createSimulationSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  mode: z.enum(["auto_future", "manual_step"]),
  horizonPreset: z.enum(["whole_life", "10_years", "1_year", "1_week"]),
  targetOutcome: z.string().max(700).optional(),
});

function toBooleanFlag(value: string | null) {
  return value === "1" || value === "true";
}

function toPositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to process simulation request.";
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureUserBootstrap(user.id);
    const { searchParams } = new URL(req.url);
    const bootstrap = toBooleanFlag(searchParams.get("bootstrap"));
    const includeActive = toBooleanFlag(searchParams.get("includeActive"));
    const limit = Math.min(50, toPositiveInt(searchParams.get("limit"), 20));

    if (bootstrap) {
      const { setup } = await loadUserSetup(user.id);
      await ensureInitialSimulation({
        profileId: user.id,
        setup: setup ?? null,
      });
    }

    const simulations = await listSimulations(user.id, limit);
    const active = simulations.find((simulation) => simulation.status === "active") ?? simulations[0] ?? null;

    if (!includeActive || !active) {
      return NextResponse.json({
        simulations,
        activeSimulationId: active?.id ?? null,
      });
    }

    const activeSimulation = await getSimulationWithNodes({
      profileId: user.id,
      simulationId: active.id,
      nodeLimit: 500,
    });

    return NextResponse.json({
      simulations,
      activeSimulationId: active.id,
      activeSimulation,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureUserBootstrap(user.id);
    const payload = await req.json().catch(() => null);
    const parsed = createSimulationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid simulation payload." }, { status: 400 });
    }

    const created = await createSimulation({
      profileId: user.id,
      input: parsed.data,
    });

    return NextResponse.json(created);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
