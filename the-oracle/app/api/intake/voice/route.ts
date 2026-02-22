import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = "alloy";
const DEFAULT_TTS_MAX_INPUT_CHARS = 700;
const ELEVENLABS_COOLDOWN_MS = 15 * 60 * 1000;

let elevenLabsCooldownUntil = 0;

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

function parseMaxInputChars() {
  const parsed = Number(process.env.TTS_MAX_INPUT_CHARS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTS_MAX_INPUT_CHARS;
  return Math.max(250, Math.min(3_000, Math.floor(parsed)));
}

function clampTextForTts(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const sentenceEnd = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?"),
  );
  if (sentenceEnd >= Math.floor(maxChars * 0.65)) {
    return sliced.slice(0, sentenceEnd + 1).trim();
  }
  return `${sliced.trimEnd()}...`;
}

async function synthesizeWithElevenLabs(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  if (Date.now() < elevenLabsCooldownUntil) return null;

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID;

  const response = await fetch(
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

  if (!response.ok) {
    if ([401, 403, 429].includes(response.status)) {
      elevenLabsCooldownUntil = Date.now() + ELEVENLABS_COOLDOWN_MS;
    }
    return null;
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) return null;
  return audioBuffer;
}

async function synthesizeWithOpenAi(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_TTS_MODEL ?? DEFAULT_OPENAI_TTS_MODEL;
  const voice = process.env.OPENAI_TTS_VOICE ?? DEFAULT_OPENAI_TTS_VOICE;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      format: "mp3",
    }),
  });

  if (!response.ok) return null;
  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) return null;
  return audioBuffer;
}

export async function POST(req: Request) {
  try {
    if (!process.env.ELEVENLABS_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "No TTS provider key configured on the server.",
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

    const cappedText = clampTextForTts(text, parseMaxInputChars());
    const audioBuffer =
      (await synthesizeWithElevenLabs(cappedText)) ??
      (await synthesizeWithOpenAi(cappedText));
    if (!audioBuffer) {
      return NextResponse.json(
        {
          error: "Unable to synthesize interviewer voice.",
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
