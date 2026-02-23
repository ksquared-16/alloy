"use client";

import { useState, FormEvent } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";

export default function SendPasswordResetClient() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          setError("You don’t have permission to send password reset emails.");
        } else {
          setError((json as { error?: string }).error ?? "Something went wrong.");
        }
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch (_) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Send password reset"
        subtitle="Send a password reset email to a user. Only admins can use this. The user will receive the same reset flow as the self-serve “Forgot password” link."
      />
      <SectionCard title="Send reset email" className="max-w-md">
        {success ? (
          <p className="text-sm text-alloy-midnight/80">
            If an account exists for that email, a reset link has been sent. We don’t confirm whether the address exists.
          </p>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-alloy-midnight/70 mb-1"
                >
                  User email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                  placeholder="user@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Sending…" : "Send password reset"}
              </button>
            </form>
          </>
        )}
      </SectionCard>
    </>
  );
}
