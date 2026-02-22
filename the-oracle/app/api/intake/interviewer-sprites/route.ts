import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVIEWER_DIR = path.join(process.cwd(), "public", "interviewer");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function GET() {
  try {
    const entries = await fs.readdir(INTERVIEWER_DIR, { withFileTypes: true });
    const sprites = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
      .map((name) => `/interviewer/${name}`);

    return NextResponse.json({ sprites });
  } catch {
    return NextResponse.json({ sprites: [] });
  }
}
