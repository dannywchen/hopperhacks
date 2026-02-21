"use client";

export async function syncLocalSimulationStateToSupabase() {
  // Best-effort no-op in this repo until authenticated cloud sync is wired.
  return {
    synced: false,
    reason: "supabase_sync_not_configured",
  } as const;
}
