"use client";

import { useEffect, useState } from "react";
import ClassicLoader from "@/components/ui/loader";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

function formatAuthErrorMessage(error: unknown, isSignUp: boolean) {
  const fallback = isSignUp
    ? "Unable to create account right now."
    : "Unable to sign in right now.";
  if (!error || typeof error !== "object") return fallback;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : fallback;
  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  const lower = message.toLowerCase();

  if (status === 422 && lower.includes("password")) {
    return "Password does not meet requirements. Use at least 8 characters.";
  }
  if (status === 422 && (lower.includes("already") || lower.includes("exists"))) {
    return "That email is already registered. Try signing in instead.";
  }
  if (!isSignUp && status === 400) {
    return "Invalid email or password.";
  }

  return message;
}

async function redirectAfterAuth(token: string) {
  await fetch("/api/user/bootstrap", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => null);

  try {
    const response = await fetch("/api/user/onboarding-status", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      window.location.href = "/onboarding";
      return;
    }
    const payload = (await response.json()) as { completedOnboarding?: boolean };
    window.location.href = payload.completedOnboarding ? "/dashboard" : "/onboarding";
  } catch {
    window.location.href = "/onboarding";
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await redirectAfterAuth(session.access_token);
        return;
      }
      setCheckingSession(false);
    }

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkingSession) return;
    setLoading(true);
    setError("");

    const { data, error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(formatAuthErrorMessage(error, isSignUp));
      setLoading(false);
      return;
    }

    const token =
      data.session?.access_token ??
      (await supabase.auth.getSession()).data.session?.access_token ??
      null;

    if (token) {
      await redirectAfterAuth(token);
      return;
    }

    setLoading(false);
    setError("Check your email to confirm your account before continuing.");
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      <div className="z-20 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
        <h1 className="font-cinzel mb-2 text-center text-3xl font-bold text-white">
          The Oracle
        </h1>
        <p className="mb-8 text-center text-sm text-white/60">
          {isSignUp ? "Create your account" : "Welcome back, wizard"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
            required
          />

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || checkingSession}
            className={`flex w-full items-center justify-center rounded-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition hover:scale-105 disabled:opacity-50 ${
              loading || checkingSession ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            {loading || checkingSession ? (
              <ClassicLoader size="sm" />
            ) : (
              isSignUp ? "Create Account" : "Enter the Oracle"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/50">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-white/80 underline hover:text-white"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
}
