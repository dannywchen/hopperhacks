import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
let pdfWorkerLoaded = false;

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
  if (!pdfWorkerLoaded) {
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfWorkerLoaded = true;
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    disableFontFace: true,
  });
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
      parser = "pdf-parse";
      extracted = await extractPdfText(bytes);
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

    return NextResponse.json({
      text,
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
