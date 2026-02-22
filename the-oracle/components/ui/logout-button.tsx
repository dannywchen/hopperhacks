"use client";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

export default function LogoutButton() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-full border border-amber-200/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/70 transition hover:border-amber-200/60 hover:text-amber-100"
    >
      Sign Out
    </button>
  );
}
