"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabaseClient";
import { clearVolatileRuntimeSessionState } from "@/lib/adminV2/runtime/runtimeSessionState";

/**
 * Idle / inactivity logout (flag-gated, opt-in).
 *
 * Enable with `NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT=1`. Off by default — runtime flag off preserves
 * legacy behavior (no idle logout). Uses the existing Supabase signOut path; introduces no new
 * auth model. Thresholds are constants now and can be wired to org policy later.
 */
export const ALLOY_OS_IDLE_LOGOUT_ENABLED = process.env.NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT === "1";

export const IDLE_WARN_MS = 25 * 60 * 1000;
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

/** Fired (with `{ detail: { remainingMs } }`) before logout so UI can surface a warning if desired. */
export const ALLOY_OS_IDLE_WARNING_EVENT = "alloy:os:idle-warning";

/** Throttle activity resets so high-frequency events (mousemove/scroll) don't thrash timers. */
const ACTIVITY_THROTTLE_MS = 1_000;

const ACTIVITY_EVENTS: readonly string[] = [
    "mousemove",
    "mousedown",
    "keydown",
    "touchstart",
    "wheel",
];

export function idleLogoutEnabled(): boolean {
    return ALLOY_OS_IDLE_LOGOUT_ENABLED;
}

type Options = {
    enabled?: boolean;
    warnMs?: number;
    logoutMs?: number;
};

export function useIdleSessionLogout(options?: Options): void {
    const router = useRouter();
    const enabled = options?.enabled ?? idleLogoutEnabled();
    const warnMs = options?.warnMs ?? IDLE_WARN_MS;
    const logoutMs = options?.logoutMs ?? IDLE_LOGOUT_MS;

    const lastActivityRef = useRef<number>(Date.now());
    const lastResetRef = useRef<number>(0);
    const loggingOutRef = useRef<boolean>(false);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === "undefined") return;

        let warnTimer: number | undefined;
        let logoutTimer: number | undefined;

        const performLogout = async () => {
            if (loggingOutRef.current) return;
            loggingOutRef.current = true;
            // Protect unattended sessions: drop volatile runtime/restore state before navigating away.
            clearVolatileRuntimeSessionState();
            try {
                const supabase = createClient();
                await supabase.auth.signOut();
            } catch {
                /* even if signOut fails, route to login below */
            }
            router.push("/login");
            router.refresh();
        };

        const clearTimers = () => {
            if (warnTimer !== undefined) window.clearTimeout(warnTimer);
            if (logoutTimer !== undefined) window.clearTimeout(logoutTimer);
        };

        const armTimers = () => {
            clearTimers();
            warnTimer = window.setTimeout(() => {
                window.dispatchEvent(
                    new CustomEvent(ALLOY_OS_IDLE_WARNING_EVENT, {
                        detail: { remainingMs: Math.max(0, logoutMs - warnMs) },
                    }),
                );
            }, warnMs);
            logoutTimer = window.setTimeout(() => {
                void performLogout();
            }, logoutMs);
        };

        const registerActivity = () => {
            const now = Date.now();
            lastActivityRef.current = now;
            if (now - lastResetRef.current < ACTIVITY_THROTTLE_MS) return;
            lastResetRef.current = now;
            armTimers();
        };

        const onVisibility = () => {
            if (document.visibilityState !== "visible") return;
            // Returning to a backgrounded tab: if the idle threshold already elapsed, log out now.
            if (Date.now() - lastActivityRef.current >= logoutMs) {
                void performLogout();
                return;
            }
            registerActivity();
        };

        ACTIVITY_EVENTS.forEach((evt) =>
            window.addEventListener(evt, registerActivity, { passive: true }),
        );
        window.addEventListener("focus", registerActivity);
        document.addEventListener("visibilitychange", onVisibility);

        armTimers();

        return () => {
            clearTimers();
            ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, registerActivity));
            window.removeEventListener("focus", registerActivity);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [enabled, warnMs, logoutMs, router]);
}
