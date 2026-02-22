"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LogOut,
  Pencil,
  PlusCircle,
  Save,
  Trash2,
  UserRoundSearch,
  WandSparkles,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { hydrateLocalSimulationStateFromSupabase } from "@/lib/client/cloud-state";
import { loadSetup } from "@/lib/client/setup-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClassicLoader from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import type { UserSetup } from "@/lib/types";

type AgentMemory = {
  id?: string;
  category: string;
  key: string;
  content: string;
  importance?: number;
  updated_at?: string;
  created_at?: string;
};

function cleanText(value: unknown, maxChars = 20_000) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export default function SettingsPage() {
  const [setup, setSetup] = useState<UserSetup | null>(() => {
    if (typeof window === "undefined") return null;
    return loadSetup();
  });
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftImportance, setDraftImportance] = useState("60");
  const [newCategory, setNewCategory] = useState("custom");
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newImportance, setNewImportance] = useState("60");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedMemory = useMemo(() => {
    return memories.reduce<Record<string, AgentMemory[]>>((acc, memory) => {
      const category = memory.category || "uncategorized";
      if (!acc[category]) acc[category] = [];
      acc[category].push(memory);
      return acc;
    }, {});
  }, [memories]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }

      const [syncResult, memoryResult] = await Promise.all([
        hydrateLocalSimulationStateFromSupabase().catch(() => ({ setup: null })),
        authFetch<AgentMemory[]>("/api/game/memory"),
      ]);

      setMemories(memoryResult ?? []);
      if (syncResult?.setup) {
        setSetup(syncResult.setup);
      } else {
        setSetup(loadSetup());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const beginEdit = useCallback((memory: AgentMemory) => {
    setEditingKey(memory.key);
    setDraftContent(memory.content);
    setDraftCategory(memory.category);
    setDraftImportance(String(memory.importance ?? 60));
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingKey) return;
    const category = cleanText(draftCategory, 120);
    const content = cleanText(draftContent, 20_000);
    if (!category || !content) return;

    setSaving(true);
    setError(null);
    try {
      await authFetch<{ success: boolean }>("/api/game/memory", {
        method: "PUT",
        body: JSON.stringify({
          key: editingKey,
          category,
          content,
          importance: Number.parseInt(draftImportance, 10) || 60,
        }),
      });
      await loadContext();
      setEditingKey(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  }, [draftCategory, draftContent, draftImportance, editingKey, loadContext]);

  const removeMemory = useCallback(async (key: string) => {
    setSaving(true);
    setError(null);
    try {
      await authFetch<{ success: boolean }>(`/api/game/memory?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      await loadContext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to delete memory.");
    } finally {
      setSaving(false);
    }
  }, [loadContext]);

  const addMemory = useCallback(async () => {
    const key = cleanText(newKey, 120);
    const category = cleanText(newCategory, 120);
    const content = cleanText(newContent, 20_000);
    if (!key || !category || !content) return;

    setSaving(true);
    setError(null);
    try {
      await authFetch<{ success: boolean }>("/api/game/memory", {
        method: "POST",
        body: JSON.stringify({
          key,
          category,
          content,
          importance: Number.parseInt(newImportance, 10) || 60,
        }),
      });
      setNewCategory("custom");
      setNewKey("");
      setNewContent("");
      setNewImportance("60");
      await loadContext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to add memory.");
    } finally {
      setSaving(false);
    }
  }, [loadContext, newCategory, newContent, newImportance, newKey]);

  const logout = useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  if (loading) {
    return (
      <main className="mystic-bg flex min-h-screen items-center justify-center px-6 text-zinc-100">
        <ClassicLoader />
      </main>
    );
  }

  return (
    <main className="mystic-bg min-h-screen px-4 py-5 text-zinc-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="rounded-2xl border border-cyan-200/25 bg-[linear-gradient(130deg,rgba(7,17,31,0.96),rgba(10,27,50,0.92))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">
                Agent Memory Control
              </p>
              <h1 className="arcane-display-title mt-1 text-3xl text-zinc-50">Settings</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300">
                Review what the agent currently knows about you, edit memory entries, and continue interviewing to deepen context quality.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center rounded-full border border-cyan-200/40 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-100/80 hover:bg-cyan-500/10"
              >
                Back to Dashboard
              </Link>
              <Button
                type="button"
                onClick={() => void logout()}
                className="h-9 rounded-full bg-rose-400/90 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 hover:bg-rose-300"
              >
                <LogOut className="mr-1 h-4 w-4" />
                Log Out
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-white/10 bg-zinc-900/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-100">Current Agent Context Files</p>
              <span className="text-xs text-zinc-400">{memories.length} entries</span>
            </div>

            <div className="space-y-4">
              {Object.entries(groupedMemory).map(([category, entries]) => (
                <div key={category} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/90">{category}</p>
                  <div className="mt-2 space-y-2.5">
                    {entries.map((memory) => {
                      const isEditing = editingKey === memory.key;
                      return (
                        <div key={memory.key} className="rounded-lg border border-white/10 bg-zinc-900/75 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="font-mono text-xs text-zinc-300">{memory.key}</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => beginEdit(memory)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-200/35 text-cyan-100 transition hover:bg-cyan-500/10"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeMemory(memory.key)}
                                disabled={saving}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200/35 text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                                <Input
                                  value={draftCategory}
                                  onChange={(event) => setDraftCategory(event.target.value)}
                                  className="h-9 border-white/10 bg-zinc-900 text-zinc-100"
                                />
                                <Input
                                  value={draftImportance}
                                  onChange={(event) => setDraftImportance(event.target.value)}
                                  className="h-9 border-white/10 bg-zinc-900 text-zinc-100"
                                />
                              </div>
                              <Textarea
                                value={draftContent}
                                onChange={(event) => setDraftContent(event.target.value)}
                                className="min-h-[100px] border-white/10 bg-zinc-900 text-zinc-100"
                              />
                              <Button
                                type="button"
                                onClick={() => void saveEdit()}
                                disabled={saving}
                                className="h-8 rounded-lg bg-cyan-200/90 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 hover:bg-cyan-100 disabled:opacity-40"
                              >
                                <Save className="mr-1 h-3.5 w-3.5" />
                                Save Memory
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm leading-relaxed text-zinc-200">{memory.content}</p>
                              <p className="mt-2 text-[11px] text-zinc-400">
                                Importance: {memory.importance ?? 60}
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-zinc-900/75 p-4">
              <p className="text-sm font-semibold text-zinc-100">Add Memory</p>
              <div className="mt-3 space-y-2">
                <Input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="category"
                  className="h-9 border-white/10 bg-zinc-900 text-zinc-100"
                />
                <Input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="key"
                  className="h-9 border-white/10 bg-zinc-900 text-zinc-100"
                />
                <Input
                  value={newImportance}
                  onChange={(event) => setNewImportance(event.target.value)}
                  placeholder="importance 0-100"
                  className="h-9 border-white/10 bg-zinc-900 text-zinc-100"
                />
                <Textarea
                  value={newContent}
                  onChange={(event) => setNewContent(event.target.value)}
                  placeholder="memory content"
                  className="min-h-[110px] border-white/10 bg-zinc-900 text-zinc-100"
                />
                <Button
                  type="button"
                  onClick={() => void addMemory()}
                  disabled={saving}
                  className="h-9 w-full rounded-lg bg-cyan-200/90 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-950 hover:bg-cyan-100 disabled:opacity-40"
                >
                  <PlusCircle className="mr-1 h-4 w-4" />
                  Add Memory
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-zinc-900/75 p-4">
              <p className="text-sm font-semibold text-zinc-100">Interview Mode</p>
              <p className="mt-2 text-sm text-zinc-300">
                Continue the same onboarding interviewer to improve context depth and behavior modeling.
              </p>
              <Link
                href="/onboarding?next=/settings"
                className="mt-3 inline-flex h-9 items-center rounded-lg border border-cyan-200/40 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-100 hover:bg-cyan-500/10"
              >
                <WandSparkles className="mr-1 h-4 w-4" />
                Continue Interview
              </Link>
            </section>

            <section className="rounded-2xl border border-white/10 bg-zinc-900/75 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <UserRoundSearch className="h-4 w-4 text-cyan-200" />
                Profile Snapshot
              </p>
              <div className="mt-3 space-y-1.5 text-sm text-zinc-300">
                <p>Name: {setup?.profile?.name || "Unknown"}</p>
                <p>Occupation: {setup?.profile?.occupation || "Unknown"}</p>
                <p>
                  Default mode:{" "}
                  {setup?.preferences?.simulationMode === "auto_future"
                    ? "Time Into The Future"
                    : "Predict Your Future Manually"}
                </p>
              </div>
            </section>
          </aside>
        </div>

        {error ? (
          <div className="rounded-xl border border-white/20 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
