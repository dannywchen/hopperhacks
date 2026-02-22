"use client";

import type { LovedOne, UserSetup } from "@/lib/types";

const STORAGE_KEY_V3 = "deep-sim.setup.v3";
const CORE_PARENTS: LovedOne[] = [
  {
    id: "parent_mum",
    name: "Mum",
    relation: "Mother",
    relationshipKind: "mum",
    relationshipStatus: "active",
    typicalHoursPerMonth: 6,
  },
  {
    id: "parent_dad",
    name: "Dad",
    relation: "Father",
    relationshipKind: "dad",
    relationshipStatus: "active",
    typicalHoursPerMonth: 6,
  },
];

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function inferParentKind(person: LovedOne): "mum" | "dad" | null {
  if (person.relationshipKind === "mum" || person.relationshipKind === "dad") {
    return person.relationshipKind;
  }
  const relation = `${person.relation ?? ""} ${person.name ?? ""}`.toLowerCase();
  if (relation.includes("mum") || relation.includes("mom") || relation.includes("mother")) {
    return "mum";
  }
  if (relation.includes("dad") || relation.includes("father")) {
    return "dad";
  }
  return null;
}

function normalizeLovedOnes(lovedOnes: LovedOne[]): LovedOne[] {
  const normalized: LovedOne[] = lovedOnes.map((person, index) => {
    const id = normalizeText(person.id) ?? `loved_one_${index + 1}`;
    const name = normalizeText(person.name) ?? `Loved one ${index + 1}`;
    const hours = Number(person.typicalHoursPerMonth);
    return {
      ...person,
      id,
      name,
      typicalHoursPerMonth: Number.isFinite(hours) ? Math.max(0, hours) : undefined,
    };
  });

  const hasMum = normalized.some((person) => inferParentKind(person) === "mum");
  const hasDad = normalized.some((person) => inferParentKind(person) === "dad");

  if (!hasMum) normalized.push({ ...CORE_PARENTS[0] });
  if (!hasDad) normalized.push({ ...CORE_PARENTS[1] });

  return normalized;
}

export function loadSetup(): UserSetup | null {
  const raw = globalThis?.localStorage?.getItem(STORAGE_KEY_V3) ?? null;
  const parsed = safeParseJson<UserSetup>(raw);
  if (!parsed) return null;
  if (parsed.version !== "v3") return null;
  if (!parsed.profile || typeof parsed.profile !== "object") return null;
  if (!parsed.model || parsed.model.version !== "career-v1") return null;
  if (!parsed.model.variables || typeof parsed.model.variables !== "object") return null;
  if (!Array.isArray(parsed.factors)) return null;
  if (!Array.isArray(parsed.lovedOnes)) return null;
  const normalizedLovedOnes = normalizeLovedOnes(parsed.lovedOnes);
  const normalized: UserSetup = {
    ...parsed,
    lovedOnes: normalizedLovedOnes,
  };
  if (JSON.stringify(normalizedLovedOnes) !== JSON.stringify(parsed.lovedOnes)) {
    globalThis?.localStorage?.setItem(STORAGE_KEY_V3, JSON.stringify(normalized));
  }
  return normalized;
}

export function saveSetup(setup: UserSetup) {
  const normalized: UserSetup = {
    ...setup,
    lovedOnes: normalizeLovedOnes(setup.lovedOnes ?? []),
  };
  globalThis?.localStorage?.setItem(STORAGE_KEY_V3, JSON.stringify(normalized));
}

export function clearSetup() {
  globalThis?.localStorage?.removeItem(STORAGE_KEY_V3);
}

export function hasSetup(): boolean {
  return Boolean(loadSetup());
}
