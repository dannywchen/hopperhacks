"use client";

import type { LifeEvent } from "@/lib/types";

const STORAGE_KEY_V1 = "deep-sim.events.v1";
const STORAGE_KEY_V2 = "deep-sim.events.v2";

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function loadEvents(): LifeEvent[] {
  const rawV2 = globalThis?.localStorage?.getItem(STORAGE_KEY_V2) ?? null;
  const parsedV2 = safeParseJson<LifeEvent[]>(rawV2);
  if (Array.isArray(parsedV2)) return parsedV2;

  const rawV1 = globalThis?.localStorage?.getItem(STORAGE_KEY_V1) ?? null;
  const parsedV1 = safeParseJson<LifeEvent[]>(rawV1);
  if (Array.isArray(parsedV1)) {
    saveEvents(parsedV1);
    return parsedV1;
  }

  return [];
}

export function saveEvents(events: LifeEvent[]) {
  globalThis?.localStorage?.setItem(STORAGE_KEY_V2, JSON.stringify(events));
}

export function clearEvents() {
  globalThis?.localStorage?.removeItem(STORAGE_KEY_V2);
  globalThis?.localStorage?.removeItem(STORAGE_KEY_V1);
}
