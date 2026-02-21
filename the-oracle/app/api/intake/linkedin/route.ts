import { NextResponse } from "next/server";
import { z } from "zod";
import type { OnboardingLinkedinProfile } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_ACTOR_ID = "yZnhB5JewWf9xSmoM";
const APIFY_BASE_URL = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 90_000;

const linkedinRequestSchema = z.object({
  profileUrl: z.string().min(8).max(600),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, maxChars = 1_600) {
  const normalized = String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}...`
    : normalized;
}

function toIsoDate(value: unknown) {
  const asString = cleanText(value, 120);
  if (!asString) return new Date().toISOString();
  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeLinkedinUrl(raw: string) {
  const candidate = raw.trim().startsWith("http")
    ? raw.trim()
    : `https://${raw.trim()}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname.includes("linkedin.com")) return null;
  if (!/^\/(in|pub)\//i.test(url.pathname)) return null;
  url.hash = "";
  url.search = "";
  return url.toString();
}

function pickFirstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = cleanText(record[key], 260);
    if (text) return text;
  }
  return "";
}

function toStringArray(value: unknown, maxItems: number, maxChars = 240) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toObjectList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => {
    return Boolean(entry) && typeof entry === "object" && !Array.isArray(entry);
  });
}

function normalizeExperienceList(profile: Record<string, unknown>) {
  const raw =
    profile.experiences ??
    profile.experience ??
    profile.positions ??
    profile.jobs ??
    [];

  const objectItems = toObjectList(raw);
  if (objectItems.length === 0) {
    return toStringArray(raw, 20, 320);
  }

  return objectItems
    .map((item) => {
      const title = pickFirstText(item, ["title", "position", "role", "jobTitle"]);
      const company = pickFirstText(item, [
        "companyName",
        "company",
        "organizationName",
      ]);
      const timeRange = pickFirstText(item, [
        "dateRange",
        "duration",
        "timePeriod",
        "date",
      ]);
      const summary = pickFirstText(item, ["description", "summary"]);
      const primary = [title, company].filter(Boolean).join(" @ ");
      return [primary, timeRange, summary].filter(Boolean).join(" | ");
    })
    .map((entry) => cleanText(entry, 420))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeEducationList(profile: Record<string, unknown>) {
  const raw = profile.education ?? profile.schools ?? profile.academics ?? [];
  const objectItems = toObjectList(raw);
  if (objectItems.length === 0) {
    return toStringArray(raw, 12, 280);
  }

  return objectItems
    .map((item) => {
      const school = pickFirstText(item, [
        "schoolName",
        "school",
        "institutionName",
        "name",
      ]);
      const degree = pickFirstText(item, [
        "degreeName",
        "degree",
        "fieldOfStudy",
        "program",
      ]);
      const period = pickFirstText(item, ["dateRange", "duration", "timePeriod"]);
      return [school, degree, period].filter(Boolean).join(" | ");
    })
    .map((entry) => cleanText(entry, 320))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeProjectList(profile: Record<string, unknown>) {
  const raw = profile.projects ?? profile.accomplishments ?? [];
  const objectItems = toObjectList(raw);
  if (objectItems.length === 0) {
    return toStringArray(raw, 15, 260);
  }
  return objectItems
    .map((item) => {
      const name = pickFirstText(item, ["title", "name", "projectName"]);
      const summary = pickFirstText(item, ["description", "summary"]);
      return [name, summary].filter(Boolean).join(" | ");
    })
    .map((entry) => cleanText(entry, 360))
    .filter(Boolean)
    .slice(0, 15);
}

function normalizeSkills(profile: Record<string, unknown>) {
  const raw =
    profile.skills ??
    profile.skillSet ??
    profile.topSkills ??
    profile.featuredSkills ??
    [];
  const objectItems = toObjectList(raw);
  if (objectItems.length === 0) {
    return toStringArray(raw, 30, 80);
  }
  return objectItems
    .map((item) => pickFirstText(item, ["name", "skill", "title"]))
    .map((entry) => cleanText(entry, 80))
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeCertifications(profile: Record<string, unknown>) {
  const raw = profile.certifications ?? profile.licenses ?? [];
  const objectItems = toObjectList(raw);
  if (objectItems.length === 0) {
    return toStringArray(raw, 15, 200);
  }
  return objectItems
    .map((item) => {
      const name = pickFirstText(item, ["name", "title", "certificationName"]);
      const issuer = pickFirstText(item, ["authority", "issuer", "organization"]);
      return [name, issuer].filter(Boolean).join(" | ");
    })
    .map((entry) => cleanText(entry, 260))
    .filter(Boolean)
    .slice(0, 15);
}

function buildLinkedinProfile(
  normalizedUrl: string,
  record: Record<string, unknown>,
): OnboardingLinkedinProfile {
  return {
    source: "apify",
    profileUrl: normalizedUrl,
    scrapedAt: toIsoDate(record.scrapedAt ?? record.timestamp ?? new Date().toISOString()),
    fullName: pickFirstText(record, ["fullName", "name", "firstName"]),
    headline: pickFirstText(record, ["headline", "title", "occupation"]),
    location: pickFirstText(record, [
      "addressWithCountry",
      "geoLocationName",
      "location",
      "city",
    ]),
    about: pickFirstText(record, ["about", "summary", "bio"]),
    experiences: normalizeExperienceList(record),
    projects: normalizeProjectList(record),
    skills: normalizeSkills(record),
    education: normalizeEducationList(record),
    certifications: normalizeCertifications(record),
  };
}

function buildProfileText(profile: OnboardingLinkedinProfile) {
  const sections = [
    profile.fullName ? `Name: ${profile.fullName}` : "",
    profile.headline ? `Headline: ${profile.headline}` : "",
    profile.location ? `Location: ${profile.location}` : "",
    profile.about ? `About: ${profile.about}` : "",
    profile.experiences.length
      ? `Experience:\n${profile.experiences.map((item) => `- ${item}`).join("\n")}`
      : "",
    profile.projects.length
      ? `Projects:\n${profile.projects.map((item) => `- ${item}`).join("\n")}`
      : "",
    profile.skills.length ? `Skills: ${profile.skills.join(", ")}` : "",
    profile.education.length
      ? `Education:\n${profile.education.map((item) => `- ${item}`).join("\n")}`
      : "",
    profile.certifications.length
      ? `Certifications:\n${profile.certifications.map((item) => `- ${item}`).join("\n")}`
      : "",
    `Profile URL: ${profile.profileUrl}`,
  ]
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.join("\n\n").slice(0, 32_000);
}

async function fetchJsonWithTimeout<T>(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const payloadRecord = asRecord(payload);
      const errorRecord = asRecord(payloadRecord?.error);
      const message =
        payloadRecord
          ? String(
              (errorRecord?.message as string | undefined) ??
                (payloadRecord.message as string | undefined) ??
                "",
            )
          : "";
      throw new Error(message || `Apify request failed (${response.status}).`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  try {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "LinkedIn ingest is not configured. Missing APIFY_API_TOKEN." },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = linkedinRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide a valid LinkedIn profile URL." },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeLinkedinUrl(parsed.data.profileUrl);
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: "Use a public LinkedIn profile URL in the form linkedin.com/in/..." },
        { status: 422 },
      );
    }

    const actorId = process.env.APIFY_LINKEDIN_ACTOR_ID || DEFAULT_ACTOR_ID;
    const endpoint = `${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?clean=true&format=json`;
    const timeoutMs = Number(process.env.APIFY_LINKEDIN_TIMEOUT_MS || REQUEST_TIMEOUT_MS);

    const actorInput = {
      urls: [{ url: normalizedUrl }],
      includeExperience: true,
      includeSkills: true,
      includeEducation: true,
      includeCertifications: true,
      includeProjects: true,
    };

    const requestBase: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    let items: unknown[] = [];
    try {
      items = await fetchJsonWithTimeout<unknown[]>(
        endpoint,
        {
          ...requestBase,
          body: JSON.stringify(actorInput),
        },
        timeoutMs,
      );
    } catch {
      items = await fetchJsonWithTimeout<unknown[]>(
        endpoint,
        {
          ...requestBase,
          body: JSON.stringify({
            urls: [{ url: normalizedUrl }],
          }),
        },
        timeoutMs,
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "LinkedIn profile data was not found by the scraper." },
        { status: 424 },
      );
    }

    const firstRecord = items.find(
      (item) => item && typeof item === "object" && !Array.isArray(item),
    ) as Record<string, unknown> | undefined;

    if (!firstRecord) {
      return NextResponse.json(
        { error: "LinkedIn scraper returned an unsupported payload." },
        { status: 424 },
      );
    }

    const profile = buildLinkedinProfile(normalizedUrl, firstRecord);
    const text = buildProfileText(profile);

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract usable LinkedIn profile text." },
        { status: 424 },
      );
    }

    return NextResponse.json({
      text,
      profile,
      meta: {
        source: "apify",
        actorId,
        itemCount: items.length,
      },
    });
  } catch (error: unknown) {
    const message = cleanText(error instanceof Error ? error.message : "", 300);
    return NextResponse.json(
      {
        error:
          message ||
          "Unable to ingest LinkedIn profile right now. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
