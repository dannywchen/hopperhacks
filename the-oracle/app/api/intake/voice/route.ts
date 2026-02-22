import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

type VoiceRequestPayload = {
  text?: unknown;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to synthesize interviewer voice.";
}

function sanitizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Missing ELEVENLABS_API_KEY on the server.",
        },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as VoiceRequestPayload;
    const text = typeof body.text === "string" ? sanitizeText(body.text) : "";
    if (!text) {
      return NextResponse.json(
        {
          error: "Text is required for voice synthesis.",
        },
        { status: 400 },
      );
    }

    if (text.length > 3_000) {
      return NextResponse.json(
        {
          error: "Text is too long. Keep each interviewer response below 3000 characters.",
        },
        { status: 413 },
      );
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID;
    const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID;

    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.18,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!elevenLabsResponse.ok) {
      const contentType = elevenLabsResponse.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? ((await elevenLabsResponse.json().catch(() => null)) as
            | { detail?: { message?: string }; message?: string }
            | null)
        : null;
      const fallbackMessage = await elevenLabsResponse.text().catch(() => "");
      const details = payload?.detail?.message ?? payload?.message ?? fallbackMessage;
      const message = details
        ? `ElevenLabs request failed: ${details}`
        : `ElevenLabs request failed with status ${elevenLabsResponse.status}.`;
      return NextResponse.json(
        {
          error: message,
        },
        { status: 502 },
      );
    }

    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    if (audioBuffer.byteLength === 0) {
      return NextResponse.json(
        {
          error: "ElevenLabs returned an empty audio response.",
        },
        { status: 502 },
      );
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
