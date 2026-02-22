"use client";

import Link from "next/link";
import { useState } from "react";
import { loadSetup } from "@/lib/client/setup-store";
import type { UserSetup } from "@/lib/types";

export default function DashboardPage() {
  const [setup] = useState<UserSetup | null>(() => {
    if (typeof window === "undefined") return null;
    return loadSetup();
  });

  const name = setup?.profile?.name?.trim() || "Wizard";

  return (
    <main className="mystic-bg min-h-screen px-4 py-10 text-zinc-100 sm:px-6">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-amber-200/20 bg-black/50 p-6 backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">The Oracle Chamber</p>
        <h1 className="mt-3 font-serif text-3xl text-amber-100 sm:text-4xl">Welcome, {name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-300 sm:text-base">
          Your onboarding memory is saved. This dashboard is now ready for the next step: branching
          simulations, custom actions, and projected life metrics.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-200/15 bg-amber-500/5 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-200/70">Death Age</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">Pending</p>
          </div>
          <div className="rounded-2xl border border-amber-200/15 bg-amber-500/5 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-200/70">Net Worth</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">Pending</p>
          </div>
          <div className="rounded-2xl border border-amber-200/15 bg-amber-500/5 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-200/70">Storyline</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">Initialized</p>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-amber-200/30 bg-amber-100/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-white"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
