import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ensureUserBootstrap, saveAgentMemory } from "@/lib/game-db";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureUserBootstrap(user.id);

    await saveAgentMemory({
      profile_id: user.id,
      category: "profile",
      key: "profile_bootstrap",
      content: JSON.stringify({
        userId: user.id,
        email: user.email ?? null,
        bootstrappedAt: new Date().toISOString(),
      }),
      importance: 70,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to initialize user profile.";
    return NextResponse.json({
      success: false,
      warning: message,
    });
  }
}
