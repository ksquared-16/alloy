"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import PrimaryButton from "@/components/PrimaryButton";
import PasswordField from "@/components/auth/PasswordField";
import { PASSWORD_POLICY, passwordChangeViolation } from "@/lib/auth/passwordPolicy";
import { passwordUpdateErrorMessage } from "@/lib/auth/signInErrorMessage";

type Status = "loading" | "ready" | "success" | "expired";

const resetInputClass =
  "w-full rounded-md px-3 py-2 text-sm border border-alloy-stone/80 bg-white focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setStatus("ready");
      } else {
        setStatus("expired");
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // W-31 — the policy is asked, not restated. It lives in one module so the eventual server-side
    // enforcement point cannot disagree with this one. See `passwordPolicy.ts` for why W-31 is not
    // closed: the product has no server-side password write to enforce it at.
    const violation = passwordChangeViolation(password, confirm);
    if (violation) {
      setError(violation);
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // W-32 — the provider's password-policy and session-state wording is not shown to an
        // unauthenticated caller on the recovery path.
        setError(passwordUpdateErrorMessage(updateError));
        setIsLoading(false);
        return;
      }
      setStatus("success");
      setPassword("");
      setConfirm("");
    } catch (_) {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
            Reset password
          </h1>
          <p className="text-alloy-midnight/70 text-sm text-center">Loading…</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
            Link expired or invalid
          </h1>
          <p className="text-alloy-midnight/80 text-sm mb-6 text-center">
            This reset link has expired or was already used. Request a new one from the sign-in page.
          </p>
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="inline-block px-4 py-2 bg-alloy-blue text-white rounded-md text-sm font-medium hover:opacity-90"
            >
              Request new link
            </Link>
            <span className="mx-2 text-alloy-midnight/50">or</span>
            <Link href="/login" className="text-alloy-blue hover:underline text-sm font-medium">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
            Password updated
          </h1>
          <p className="text-alloy-midnight/80 text-sm mb-6 text-center">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              className="block w-full text-center px-4 py-2 bg-alloy-midnight text-white rounded-md text-sm font-medium hover:opacity-90"
            >
              Sign in
            </Link>
            <Link
              href="/admin"
              className="block w-full text-center text-alloy-blue hover:underline text-sm"
            >
              Go to admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-alloy-stone py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
        <h1 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
          Set new password
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* W-30 — both fields come from the one shared component (`RL-37`). */}
          <PasswordField
            id="password"
            label="New password"
            labelClassName="block text-xs font-semibold tracking-wide mb-1 text-alloy-midnight/70"
            value={password}
            onChange={setPassword}
            required
            className={`${resetInputClass} pr-16`}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={PASSWORD_POLICY.minLength}
          />
          <PasswordField
            id="confirm"
            label="Confirm password"
            labelClassName="block text-xs font-semibold tracking-wide mb-1 text-alloy-midnight/70"
            value={confirm}
            onChange={setConfirm}
            required
            className={`${resetInputClass} pr-16`}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={PASSWORD_POLICY.minLength}
          />
          <div className="pt-2">
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Updating…" : "Update password"}
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
