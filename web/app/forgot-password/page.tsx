"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import PrimaryButton from "@/components/PrimaryButton";

function getResetRedirectUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) return `${base.replace(/\/$/, "")}/reset-password`;
  if (typeof window !== "undefined") return `${window.location.origin}/reset-password`;
  return "";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setSuccess(false);

    try {
      const redirectTo = getResetRedirectUrl();
      if (!redirectTo) {
        setError("Configuration error: NEXT_PUBLIC_APP_URL is not set.");
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    } catch (_) {
      // Do not surface error details (prevent enumeration)
    }

    setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
            Check your email
          </h1>
          <p className="text-alloy-midnight/80 text-sm mb-6 text-center">
            If an account exists for that email, we’ve sent a link to reset your password. Please check your inbox and spam folder.
          </p>
          <div className="text-center">
            <Link
              href="/login"
              className="text-alloy-blue hover:underline text-sm font-medium"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
        <h1 className="text-2xl font-bold text-alloy-midnight mb-2 text-center">
          Forgot password
        </h1>
        <p className="text-alloy-midnight/70 text-sm text-center mb-6">
          Enter your email and we’ll send you a link to reset your password.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error}
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
          <div className="pt-2">
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Sending…" : "Send reset link"}
            </PrimaryButton>
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-alloy-midnight/70">
          <Link href="/login" className="text-alloy-blue hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
