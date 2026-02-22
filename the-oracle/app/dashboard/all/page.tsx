"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import { Plus, Play, Edit2, Check, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import ClassicLoader from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SimulationRun, SimulationMode } from "@/lib/types";

const retroFont = Press_Start_2P({
    subsets: ["latin"],
    weight: ["400"],
});

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
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
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return payload as T;
}

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "Something went wrong.";
}

export default function AllSimulationsPage() {
    const router = useRouter();
    const [simulations, setSimulations] = useState<SimulationRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    const fetchSimulations = useCallback(async () => {
        setLoading(true);
        try {
            const result = await authFetch<{ simulations: SimulationRun[] }>("/api/simulation?limit=50");
            setSimulations(result.simulations ?? []);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSimulations();
    }, [fetchSimulations]);

    const startNewSimulation = async (mode: SimulationMode) => {
        setCreating(true);
        try {
            await authFetch<unknown>("/api/simulation", {
                method: "POST",
                body: JSON.stringify({
                    mode,
                    horizonPreset: "10_years",
                }),
            });
            setShowCreateDialog(false);
            router.push("/dashboard");
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const renameSimulation = async (id: string) => {
        if (!newName.trim()) return;
        try {
            await authFetch(`/api/simulation/${id}`, {
                method: "PUT",
                body: JSON.stringify({ title: newName.trim() }),
            });
            setSimulations(simulations.map((s: SimulationRun) => s.id === id ? { ...s, title: newName.trim() } : s));
            setEditingId(null);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        }
    };

    const playSimulation = async (id: string) => {
        try {
            router.push(`/dashboard?id=${id}`);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-black">
                <ClassicLoader />
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto bg-black p-12">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-end mb-16 border-b border-white/10 pb-8">
                    <div>
                        <h1 className={`${retroFont.className} text-xl text-white tracking-widest uppercase`}>
                            Simulations
                        </h1>
                        <p className="text-white/40 text-xs mt-4 uppercase tracking-tighter">
                            Manage your timeline trajectories
                        </p>
                    </div>
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        disabled={creating}
                        className="rounded-none border-2 border-white/20 hover:border-white transition-all bg-transparent text-white px-8 h-12 uppercase font-medium tracking-tight"
                    >
                        {creating ? <ClassicLoader size="sm" /> : <><Plus className="w-4 h-4 mr-2" /> New Game</>}
                    </Button>
                </div>

                {error && (
                    <div className="bg-red-900/10 border border-red-900/40 text-red-300 p-4 rounded-none mb-8 text-xs uppercase tracking-tight">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-t border-white/10">
                    {simulations.map((sim: SimulationRun) => (
                        <div
                            key={sim.id}
                            className="group relative border-r border-b border-white/10 p-8 hover:bg-white/[0.02] transition-colors cursor-pointer flex flex-col min-h-[220px]"
                            onClick={() => editingId !== sim.id && playSimulation(sim.id)}
                        >
                            <div className="flex justify-between items-start mb-6">
                                {editingId === sim.id ? (
                                    <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            autoFocus
                                            className="bg-black border border-white/40 rounded-none px-3 py-2 text-sm w-full outline-none focus:border-white text-white"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") renameSimulation(sim.id);
                                                if (e.key === "Escape") setEditingId(null);
                                            }}
                                        />
                                        <button onClick={() => renameSimulation(sim.id)} className="text-white hover:text-green-400 transition-colors">
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="text-white/40 hover:text-white transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-medium text-white/90 group-hover:text-white transition-colors line-clamp-2">
                                            {sim.title}
                                        </h3>
                                        <button
                                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingId(sim.id);
                                                setNewName(sim.title);
                                            }}
                                        >
                                            <Edit2 className="w-3.5 h-3.5 text-white/40 group-hover:text-white" />
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="mt-auto space-y-2">
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                                    <span className="text-white/30">Status</span>
                                    <span className={sim.status === "active" ? "text-white" : "text-white/40"}>{sim.status}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                                    <span className="text-white/30">Mode</span>
                                    <span className="text-white/60">{sim.mode === "manual_step" ? "Story" : "Auto"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                                    <span className="text-white/30">Last Modified</span>
                                    <span className="text-white/60">{new Date(sim.updatedAt || sim.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all">
                                <Play className="w-4 h-4 text-white p-0.5" />
                            </div>
                        </div>
                    ))}

                    {simulations.length === 0 && !loading && (
                        <div className="col-span-full border-b border-r border-white/10 p-20 text-center">
                            <p className="text-white/20 uppercase tracking-widest text-xs">
                                No simulation records found. Start a new game to begin.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-2xl bg-black border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl uppercase tracking-wide">New Game</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Select how you want to predict your future.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => startNewSimulation("auto_future")}
                            disabled={creating}
                            className="text-left rounded-none border border-white/20 p-4 transition-colors hover:border-white/60 hover:bg-white/5 disabled:opacity-60"
                        >
                            <p className="text-sm font-semibold uppercase tracking-wide text-white">Auto Predict</p>
                            <p className="mt-2 text-xs text-white/70">Auto predict my future in 10 years.</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => startNewSimulation("manual_step")}
                            disabled={creating}
                            className="text-left rounded-none border border-white/20 p-4 transition-colors hover:border-white/60 hover:bg-white/5 disabled:opacity-60"
                        >
                            <p className="text-sm font-semibold uppercase tracking-wide text-white">Manual Predict</p>
                            <p className="mt-2 text-xs text-white/70">Manually predict my future myself.</p>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
