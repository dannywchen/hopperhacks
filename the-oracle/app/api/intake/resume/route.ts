import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { saveAgentMemory } from "@/lib/game-db";
import type { OnboardingLinkedinProfile } from "@/lib/types";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

function ensurePdfJsNodeGlobals() {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  // pdfjs-dist can touch DOMMatrix in Node paths, even for text extraction.
  class MinimalDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }

    multiplySelf() {
      return this;
    }

    preMultiplySelf() {
      return this;
    }

    translateSelf() {
      return this;
    }

    scaleSelf() {
      return this;
    }

    rotateSelf() {
      return this;
    }

    inverse() {
      return this;
    }

    invertSelf() {
      return this;
    }

    static fromFloat32Array() {
      return new MinimalDOMMatrix();
    }

    static fromFloat64Array() {
      return new MinimalDOMMatrix();
    }

    static fromMatrix() {
      return new MinimalDOMMatrix();
    }
  }

  (globalThis as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix =
    MinimalDOMMatrix as unknown as typeof DOMMatrix;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unable to parse resume. Try another file or paste text manually.";
}

function normalizeExtractedText(value: string) {
  const normalized = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  const squashed = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (squashed.length <= MAX_TEXT_CHARS) return squashed;
  return `${squashed.slice(0, MAX_TEXT_CHARS)}\n[TRUNCATED]`;
}

function inferMimeType(file: File) {
  const lowerName = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  if (mime.includes("pdf") || lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (
    mime.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    lowerName.endsWith(".docx")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (mime.startsWith("text/") || lowerName.endsWith(".txt")) {
    return "text/plain";
  }
  return mime || "application/octet-stream";
}

async function extractPdfText(buffer: Buffer) {
  ensurePdfJsNodeGlobals();

  const pdfModule = await import("pdf-parse");
  const parser = new pdfModule.PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function extractPlainText(buffer: Buffer) {
  return buffer.toString("utf8");
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const rawFile = form.get("file");
    if (!(rawFile instanceof File)) {
      return NextResponse.json(
        { error: "Upload a resume file under the `file` field." },
        { status: 400 },
      );
    }
    if (rawFile.size <= 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 },
      );
    }
    if (rawFile.size > MAX_RESUME_BYTES) {
      return NextResponse.json(
        {
          error: `Resume exceeds ${(MAX_RESUME_BYTES / (1024 * 1024)).toFixed(0)}MB limit.`,
        },
        { status: 413 },
      );
    }

    const mimeType = inferMimeType(rawFile);
    const bytes = Buffer.from(await rawFile.arrayBuffer());

    let parser = "plain";
    let extracted = "";
    if (mimeType === "application/pdf") {
      parser = "pdf-parse-v2";
      try {
        extracted = await extractPdfText(bytes);
      } catch (pdfError) {
        console.error("PDF extraction failed:", pdfError);
        return NextResponse.json(
          {
            error:
              "Could not parse this PDF file. Try another PDF, upload DOCX, or paste text manually.",
          },
          { status: 422 },
        );
      }
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      parser = "mammoth";
      extracted = await extractDocxText(bytes);
    } else {
      parser = "utf8";
      extracted = extractPlainText(bytes);
    }

    const text = normalizeExtractedText(extracted);
    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable text from this file. Try PDF, DOCX, or paste text manually.",
        },
        { status: 422 },
      );
    }

    let profile: OnboardingLinkedinProfile | null = null;
    try {
      if (process.env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are an expert resume parser. Extract the following candidate information from the provided resume text.
Format the output as a valid JSON object matching this schema:
{
  "fullName": "string (optional)",
  "headline": "string (optional, usually current role or summary)",
  "location": "string (optional)",
  "about": "string (optional, professional summary)",
  "experiences": ["string (format: 'Role @ Company | Date Range | Summary')", ...],
  "projects": ["string (format: 'Project Name | Summary')", ...],
  "skills": ["string", ...],
  "education": ["string (format: 'School | Degree | Date Range')", ...],
  "certifications": ["string (format: 'Name | Issuer')", ...]
}
Return ONLY the raw JSON object, without any markdown formatting or code blocks. Make sure arrays are strings. Limit arrays to top 15 items each.

Resume Text:
${text.slice(0, 30_000)}
`;
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });
        const responseText = result.response.text();
        const parsedProfile = JSON.parse(responseText);
        profile = {
          source: "resume",
          profileUrl: "",
          scrapedAt: new Date().toISOString(),
          ...parsedProfile
        };
      }
    } catch (llmError) {
      console.error("LLM Extraction failed:", llmError);
    }

    await saveAgentMemory({
      profile_id: user.id,
      category: "onboarding_intake",
      key: "onboarding_resume_latest",
      content: JSON.stringify({
        profile,
        text: text.slice(0, 12_000),
        updatedAt: new Date().toISOString()
      }),
      importance: 90,
    });

    return NextResponse.json({
      text,
      profile,
      meta: {
        parser,
        fileName: rawFile.name,
        mimeType,
        bytes: rawFile.size,
        characters: text.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: errorMessage(error),
      },
      { status: 500 },
    );
  }
}
