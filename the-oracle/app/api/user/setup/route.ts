import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import {
  ensureUserBootstrap,
  loadUserSetup,
  saveAgentMemory,
  saveUserSetup,
} from "@/lib/game-db";

const saveSetupSchema = z.object({
  setup: z.record(z.string(), z.unknown()),
});

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureUserBootstrap(user.id);
    const result = await loadUserSetup(user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load setup.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => null);
    const parsed = saveSetupSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid setup payload." }, { status: 400 });
    }

    await ensureUserBootstrap(user.id);
    await saveUserSetup(user.id, parsed.data.setup);

    await saveAgentMemory({
      profile_id: user.id,
      category: "profile",
      key: "user_setup_latest",
      content: JSON.stringify({
        updatedAt: new Date().toISOString(),
        version:
          typeof parsed.data.setup.version === "string"
            ? parsed.data.setup.version
            : null,
        profileName:
          typeof parsed.data.setup.profile === "object" &&
          parsed.data.setup.profile &&
          "name" in parsed.data.setup.profile
            ? (parsed.data.setup.profile as Record<string, unknown>).name ?? null
            : null,
      }),
      importance: 94,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save setup.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
