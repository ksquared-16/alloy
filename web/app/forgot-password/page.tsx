"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import CTAButton from "@/components/marketing/CTAButton";
import AuthShell, { AUTH_INPUT_CLASS, AUTH_LABEL_CLASS, AUTH_LINK_CLASS, AuthAlert } from "@/components/auth/AuthShell";
import {
    createSingleFlight,
    passwordRecoveryFailureMessage,
    passwordRecoveryRequestOutcome,
} from "@/lib/auth/passwordRecoveryRequest";

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
    const flight = useRef(createSingleFlight());
    const mounted = useRef(true);
    const confirmationHeading = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Move focus to the confirmation so a screen reader announces the page change.
    useEffect(() => {
        if (success) confirmationHeading.current?.focus();
    }, [success]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // One request at a time: a second email would invalidate the first link (see createSingleFlight).
        await flight.current.run(async () => {
            setError(null);
            setIsLoading(true);
            try {
                const redirectTo = getResetRedirectUrl();
                if (!redirectTo) {
                    setError("Configuration error: NEXT_PUBLIC_APP_URL is not set.");
                    return;
                }

                let providerError: unknown = null;
                try {
                    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
                    providerError = resetError;
                } catch (thrown) {
                    providerError = thrown;
                }
                if (!mounted.current) return;

                // F-1 — only failures that are true of every caller are reported; account state never is.
                const failure = passwordRecoveryFailureMessage(passwordRecoveryRequestOutcome(providerError));
                if (failure) {
                    setError(failure);
                    return;
                }
                setSuccess(true);
            } finally {
                if (mounted.current) setIsLoading(false);
            }
        });
    };

    if (success) {
        return (
            <AuthShell>
                <h1
                    ref={confirmationHeading}
                    tabIndex={-1}
                    className="text-2xl font-bold tracking-tight text-alloy-forge outline-none md:text-3xl"
                >
                    Check your email
                </h1>
                <div role="status" className="mt-4 space-y-3 text-sm leading-relaxed text-alloy-forge/70">
                    <p>
                        If an account exists for that email, we&rsquo;ve sent a link to reset your password. Check your
                        inbox and spam folder.
                    </p>
                    <p>Only the most recent link works. If you asked more than once, use the newest email.</p>
                </div>
                <div className="mt-8 flex flex-col gap-3">
                    <CTAButton href="/login" className="w-full">
                        Back to sign in
                    </CTAButton>
                    <CTAButton
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                            setSuccess(false);
                            setError(null);
                        }}
                    >
                        Use a different email
                    </CTAButton>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell>
            <h1 className="text-2xl font-bold tracking-tight text-alloy-forge md:text-3xl">Reset your password</h1>
            <p className="mt-2 text-sm text-alloy-forge/60">
                Enter the email you sign in with and we&rsquo;ll send you a link to choose a new password.
            </p>

            {error && <AuthAlert id="forgot-password-error">{error}</AuthAlert>}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5" aria-busy={isLoading}>
                <div>
                    <label htmlFor="email" className={AUTH_LABEL_CLASS}>
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={AUTH_INPUT_CLASS}
                        placeholder="you@example.com"
                        autoComplete="email"
                        aria-describedby={error ? "forgot-password-error" : undefined}
                    />
                </div>

                <CTAButton type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? "Sending…" : "Send reset link"}
                </CTAButton>

                <p className="text-center text-sm text-alloy-forge/60">
                    <Link href="/login" className={AUTH_LINK_CLASS}>
                        Back to sign in
                    </Link>
                </p>
            </form>
        </AuthShell>
    );
}
