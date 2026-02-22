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
  let stage = "authenticate_user";
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    stage = "parse_payload";
    const payload = await req.json().catch(() => null);
    const parsed = saveSetupSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid setup payload." }, { status: 400 });
    }

    stage = "bootstrap_user";
    await ensureUserBootstrap(user.id);
    stage = "save_user_setup";
    await saveUserSetup(user.id, parsed.data.setup);

    let memoryWarning: string | null = null;
    stage = "save_memory";
    try {
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
      });

      const lifeStory = (parsed.data.setup.onboarding as any)?.lifeStory;
      if (typeof lifeStory === "string" && lifeStory.trim().length > 0) {
        await saveAgentMemory({
          profile_id: user.id,
          category: "profile",
          key: "profile_supplemental_story",
          content: lifeStory.substring(0, 12000),
          importance: 88,
        });
      }
    } catch (memoryError: unknown) {
      memoryWarning =
        memoryError instanceof Error ? memoryError.message : "Failed to save setup memory.";
      console.error(`[api/user/setup] memory warning`, memoryError);
    }

    return NextResponse.json({ success: true, memoryWarning });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save setup.";
    console.error(`[api/user/setup] failed at stage=${stage}`, error);
    return NextResponse.json(
      { error: `${message} (stage: ${stage})`, stage },
      { status: 500 },
    );
  }
}
