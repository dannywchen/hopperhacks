"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import { Plus, Play, Edit2, Check, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import ClassicLoader from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import type { SimulationRun, SimulationMode, SimulationHorizonPreset } from "@/lib/types";

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

export default function AllSimulationsPage() {
    const router = useRouter();
    const [simulations, setSimulations] = useState<SimulationRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);

    const fetchSimulations = useCallback(async () => {
        setLoading(true);
        try {
            const result = await authFetch<{ simulations: SimulationRun[] }>("/api/simulation?limit=50");
            setSimulations(result.simulations ?? []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSimulations();
    }, [fetchSimulations]);

    const startNewSimulation = async () => {
        setCreating(true);
        try {
            await authFetch<any>("/api/simulation", {
                method: "POST",
                body: JSON.stringify({
                    mode: "manual_step",
                    horizonPreset: "10_years",
                }),
            });
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message);
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
        } catch (err: any) {
            setError(err.message);
        }
    };

    const playSimulation = async (id: string) => {
        try {
            router.push(`/dashboard?id=${id}`);
        } catch (err: any) {
            setError(err.message);
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
                        onClick={startNewSimulation}
                        disabled={creating}
                        className="rounded-none border-2 border-white/20 hover:border-white transition-all bg-transparent text-white px-8 h-12 uppercase font-medium tracking-tight"
                    >
                        {creating ? <ClassicLoader size="sm" /> : <><Plus className="w-4 h-4 mr-2" /> New Entry</>}
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
                                No simulation records found. Start a new entry to begin.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
