import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ensureUserBootstrap, loadOnboardingStatus } from "@/lib/game-db";

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureUserBootstrap(user.id);
    const status = await loadOnboardingStatus(user.id);
    return NextResponse.json(status);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to load onboarding status.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
