"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import CTAButton from "@/components/marketing/CTAButton";
import PasswordField from "@/components/auth/PasswordField";
import AuthShell, { AUTH_INPUT_CLASS, AUTH_LABEL_CLASS, AUTH_LINK_CLASS, AuthAlert } from "@/components/auth/AuthShell";
import { PASSWORD_POLICY, passwordChangeViolation } from "@/lib/auth/passwordPolicy";
import { passwordUpdateErrorMessage, signInErrorMessage } from "@/lib/auth/signInErrorMessage";
import {
    createRecoverySessionCache,
    createSingleFlight,
    updatePasswordForBoundAccount,
    withoutRecoveryLink,
    type RecoveryMode,
} from "@/lib/auth/passwordRecoveryRequest";

type Status = "loading" | "ready" | "success" | "expired" | "unavailable" | "account_changed";

/** Module scope: survives StrictMode effect replay and remounts within one page load. */
const establishRecoverySessionOnce = createRecoverySessionCache();

const HEADING_CLASS = "text-2xl font-bold tracking-tight text-alloy-forge outline-none md:text-3xl";

export default function ResetPasswordPage() {
    const [status, setStatus] = useState<Status>("loading");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
    // The account this form was opened for. Submit changes this account's password or nothing.
    const [bound, setBound] = useState<{ userId: string | null; email: string | null; mode: RecoveryMode }>({
        userId: null,
        email: null,
        mode: "recovery",
    });
    const flight = useRef(createSingleFlight());
    const mounted = useRef(true);
    const heading = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        mounted.current = true;
        let cancelled = false;

        async function checkSession() {
            // Both link shapes (PKCE `?code=`, administrator-sent `#access_token=`) are read; both a RETURNED
            // error and a thrown one are classified; neither is passed through.
            // The link is cleared before this settles, so a StrictMode replay or remount must reuse the first
            // answer rather than re-read a cleared address and adopt an unrelated held session.
            const { state, failure, userId, email, mode } = await establishRecoverySessionOnce(() => createClient().auth, {
                href: () => window.location.href,
                clearLink: () =>
                    window.history.replaceState(window.history.state, "", withoutRecoveryLink(window.location.href)),
            });
            if (cancelled) return;
            if (state === "unavailable") setUnavailableMessage(signInErrorMessage(failure));
            setBound({ userId, email, mode });
            setStatus(state);
        }

        checkSession();
        return () => {
            cancelled = true;
            mounted.current = false;
        };
    }, []);

    // Announce each state change by moving focus to its heading.
    useEffect(() => {
        if (status !== "loading") heading.current?.focus();
    }, [status]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // One update at a time: a second press while the first is in flight must not race it.
        await flight.current.run(async () => {
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
                // Never whichever session the browser holds NOW: only the account the form was opened for.
                const supabase = createClient();
                const outcome = await updatePasswordForBoundAccount(
                    { getSession: () => supabase.auth.getSession(), updateUser: (attributes) => supabase.auth.updateUser(attributes) },
                    bound.userId,
                    password,
                );
                if (!mounted.current) return;
                if (!outcome.ok && outcome.reason === "account_changed") {
                    setPassword("");
                    setConfirm("");
                    setStatus("account_changed");
                    return;
                }
                if (!outcome.ok) {
                    // W-32 — the provider's password-policy and session-state wording is not shown to an
                    // unauthenticated caller on the recovery path.
                    setError(passwordUpdateErrorMessage(outcome.error));
                    return;
                }
                setStatus("success");
                setPassword("");
                setConfirm("");
            } catch (thrown) {
                // An interrupted request (connection dropped mid-update) is mapped like any other failure;
                // the fields are kept so the operator can retry without retyping.
                if (mounted.current) setError(passwordUpdateErrorMessage(thrown));
            } finally {
                if (mounted.current) setIsLoading(false);
            }
        });
    };

    if (status === "loading") {
        return (
            <AuthShell>
                <h1 className={HEADING_CLASS}>Reset your password</h1>
                <p role="status" className="mt-4 text-sm text-alloy-forge/60">
                    Checking your reset link…
                </p>
            </AuthShell>
        );
    }

    if (status === "unavailable") {
        return (
            <AuthShell>
                <h1 ref={heading} tabIndex={-1} className={HEADING_CLASS}>
                    We couldn&rsquo;t check your reset link
                </h1>
                <AuthAlert>{unavailableMessage}</AuthAlert>
                <p className="mt-6 text-sm text-alloy-forge/60">
                    Reload this page to try again. If it still doesn&rsquo;t work, request a new link.
                </p>
                <p className="mt-6 text-center text-sm text-alloy-forge/60">
                    <Link href="/login" className={AUTH_LINK_CLASS}>
                        Back to sign in
                    </Link>
                </p>
            </AuthShell>
        );
    }

    if (status === "account_changed") {
        return (
            <AuthShell>
                <h1 ref={heading} tabIndex={-1} className={HEADING_CLASS}>
                    Your password was not changed
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-alloy-forge/70">
                    A different account is now signed in in this browser, so nothing was changed. Open your reset
                    link again, or sign in as the account you want to update.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                    <CTAButton href="/forgot-password" className="w-full">
                        Request a new link
                    </CTAButton>
                    <CTAButton href="/login" variant="ghost" className="w-full">
                        Back to sign in
                    </CTAButton>
                </div>
            </AuthShell>
        );
    }

    if (status === "expired") {
        return (
            <AuthShell>
                <h1 ref={heading} tabIndex={-1} className={HEADING_CLASS}>
                    This reset link has expired
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-alloy-forge/70">
                    Reset links work once and only for a limited time, and only the most recent one you asked for is
                    valid. A link you requested yourself also has to be opened in the browser you requested it
                    from. Request a new link to continue.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                    <CTAButton href="/forgot-password" className="w-full">
                        Request a new link
                    </CTAButton>
                    <CTAButton href="/login" variant="ghost" className="w-full">
                        Back to sign in
                    </CTAButton>
                </div>
            </AuthShell>
        );
    }

    if (status === "success") {
        return (
            <AuthShell>
                <h1 ref={heading} tabIndex={-1} className={HEADING_CLASS}>
                    Password updated
                </h1>
                <p role="status" className="mt-4 text-sm leading-relaxed text-alloy-forge/70">
                    Your password has been changed. Use it the next time you sign in.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                    <CTAButton href="/workspace" className="w-full">
                        Continue to your workspace
                    </CTAButton>
                    <CTAButton href="/login" variant="ghost" className="w-full">
                        Back to sign in
                    </CTAButton>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell>
            <h1 ref={heading} tabIndex={-1} className={HEADING_CLASS}>
                Choose a new password
            </h1>
            {/* Which account changes, and why: a recovery link, or the operator's own signed-in session. */}
            <p data-reset-target className="mt-2 text-sm text-alloy-forge/70">
                {bound.mode === "signed_in"
                    ? <>You&rsquo;re signed in{bound.email ? <> as <strong>{bound.email}</strong></> : null}. This changes that account&rsquo;s password.</>
                    : <>Resetting the password{bound.email ? <> for <strong>{bound.email}</strong></> : null}.</>}
            </p>
            <p id="reset-password-policy" className="mt-2 text-sm text-alloy-forge/60">
                Use at least {PASSWORD_POLICY.minLength} characters.
            </p>

            {error && <AuthAlert id="reset-password-error">{error}</AuthAlert>}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5" aria-busy={isLoading}>
                {/* W-30 — both fields come from the one shared component (`RL-37`). */}
                <PasswordField
                    id="password"
                    label="New password"
                    labelClassName={AUTH_LABEL_CLASS}
                    value={password}
                    onChange={setPassword}
                    required
                    className={`${AUTH_INPUT_CLASS} pr-16`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={PASSWORD_POLICY.minLength}
                    describedBy={error ? "reset-password-policy reset-password-error" : "reset-password-policy"}
                />
                <PasswordField
                    id="confirm"
                    label="Confirm new password"
                    labelClassName={AUTH_LABEL_CLASS}
                    value={confirm}
                    onChange={setConfirm}
                    required
                    className={`${AUTH_INPUT_CLASS} pr-16`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={PASSWORD_POLICY.minLength}
                    describedBy={error ? "reset-password-error" : undefined}
                />
                <CTAButton type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? "Updating…" : "Update password"}
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
