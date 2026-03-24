"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import PrimaryButton from "@/components/PrimaryButton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const errorParam = searchParams?.get("error");

  const hasClientEnvVars = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const initialError =
    errorParam === "unauthorized"
      ? "You are not authorized to access the admin area."
      : errorParam === "config" && !hasClientEnvVars
        ? "Configuration error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Failed to sign in. Please check your credentials.");
        return;
      }

      if (!data.user) {
        setError("Sign in failed. Please try again.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("NEXT_PUBLIC_SUPABASE")) {
        setError("Configuration error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      } else {
        setError(message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
        <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
          Admin Sign In
        </h1>

        {(error || initialError) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error || initialError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wide mb-1 text-alloy-midnight/70"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md px-3 py-2 text-sm border border-alloy-stone/80 bg-white focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wide mb-1 text-alloy-midnight/70"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md px-3 py-2 text-sm border border-alloy-stone/80 bg-white focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue"
              placeholder="••••••••"
            />
          </div>

          <div className="pt-2">
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </PrimaryButton>
          </div>
          <p className="mt-4 text-center text-sm text-alloy-midnight/70">
            <a href="/forgot-password" className="text-alloy-blue hover:underline">
              Forgot password?
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
            Admin Sign In
          </h1>
          <p className="text-alloy-midnight/70 text-center">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
