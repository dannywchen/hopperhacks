"use client";

import { loadSetup, saveSetup } from "@/lib/client/setup-store";
import type { UserSetup } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

type SyncResult = {
  synced: boolean;
  reason?: string;
  setup?: UserSetup;
  updatedAt?: string | null;
};

async function authHeaders() {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function syncLocalSimulationStateToSupabase() {
  const localSetup = loadSetup();
  if (!localSetup) {
    return { synced: false, reason: "no_local_setup" } as SyncResult;
  }

  const headers = await authHeaders();
  if (!headers) {
    return { synced: false, reason: "no_active_session" } as SyncResult;
  }

  const response = await fetch("/api/user/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ setup: localSetup }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Sync failed (${response.status}).`);
  }

  return {
    synced: true,
    setup: localSetup,
    updatedAt: localSetup.updatedAt ?? null,
  } as SyncResult;
}

export async function hydrateLocalSimulationStateFromSupabase() {
  const headers = await authHeaders();
  if (!headers) {
    return { synced: false, reason: "no_active_session" } as SyncResult;
  }

  const response = await fetch("/api/user/setup", {
    method: "GET",
    headers: {
      ...headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Setup fetch failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    setup?: UserSetup | null;
    updatedAt?: string | null;
  };
  const remoteSetup = payload?.setup ?? null;
  if (!remoteSetup) {
    return { synced: false, reason: "no_remote_setup" } as SyncResult;
  }

  const localSetup = loadSetup();
  const localTimestamp = Date.parse(localSetup?.updatedAt ?? "");
  const remoteTimestamp = Date.parse(remoteSetup.updatedAt ?? payload.updatedAt ?? "");
  const shouldApplyRemote =
    !localSetup ||
    (Number.isFinite(remoteTimestamp) &&
      (!Number.isFinite(localTimestamp) || remoteTimestamp > localTimestamp));

  if (shouldApplyRemote) {
    saveSetup(remoteSetup);
  }

  return {
    synced: shouldApplyRemote,
    setup: shouldApplyRemote ? remoteSetup : localSetup ?? remoteSetup,
    updatedAt: payload.updatedAt ?? remoteSetup.updatedAt ?? null,
  } as SyncResult;
}
