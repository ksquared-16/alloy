/**
 * Soft-nav reload floor (NAV-1 (A) / Surface Host + Configuration Continuity Checkpoint A).
 *
 * Eligible Workspace <-> Work Unit and Organization / Settings navigations commit via
 * `router.push` (soft) so the AdminV2 shell stays mounted. `runAdminV2NavigationTransition`
 * has no post-commit recovery, so this is the reload floor: after a soft commit we arm a
 * watchdog — if the navigation has NOT reached the target path by the timeout (and has not
 * been superseded by a newer navigation), recover via the guaranteed hard reload
 * (`window.location.assign`, injected). Bounds the worst case to a delayed reload —
 * never a stuck / dead soft-nav frame. `window.location.assign` is retained, never removed.
 */

import { normalizeToCanonicalAdminPath } from "@/lib/admin/canonicalAdminRoutes";
import { normalizeOperatorPathname } from "@/lib/admin/canonicalOperatorRoutes";
import { isConfigurationSoftNavEligibleHref } from "@/lib/configRuntime/configurationContinuity";

/**
 * The floor is a GENUINELY-HUNG detector, not a slow-nav detector. A soft nav that is merely slow
 * (a heavy server render — dynamic layout, cold data) is still progressing and MUST NOT be reloaded:
 * reloading it just restarts the same slow work AND throws away the retained shell — the operator
 * experiences it as an "unexpected reload". So the threshold sits well beyond any legitimate nav:
 * fast navigations (the common case) never approach it, and it fires only when a nav has plainly
 * died and will never reach its target. (Was 3s, which guillotined normal-but-slow navigations.)
 */
export const DEFAULT_SOFT_NAV_RELOAD_FLOOR_MS = 15000;

/** Monotonic generation — a newer soft nav supersedes older watchdogs so they never fire late. */
let softNavGeneration = 0;

/** The single armed watchdog timer, so a newer nav CANCELS the prior one outright (no stale timers
 * accumulate). Generation still guards a fire; this just means a superseded timer never even runs. */
let activeTimerHandle: ReturnType<typeof setTimeout> | null = null;
let activeTimerClear: ((handle: ReturnType<typeof setTimeout>) => void) | null = null;

function cancelActiveReloadFloorTimer(): void {
    if (activeTimerHandle != null && activeTimerClear) activeTimerClear(activeTimerHandle);
    activeTimerHandle = null;
    activeTimerClear = null;
}

/** Canonicalize workspace OR configuration paths for stall comparison. */
export function normalizeSoftNavReloadPathname(pathname: string): string {
    if (isConfigurationSoftNavEligibleHref(pathname)) {
        return normalizeToCanonicalAdminPath(pathname.trim());
    }
    return normalizeOperatorPathname(pathname);
}

/**
 * Pure decision: at watchdog time, does the soft nav look stalled (→ fire the reload floor)?
 * - superseded by a newer navigation → never fire (that navigation owns the floor now);
 * - otherwise fire iff the current path has not reached the target (canonicalized comparison).
 */
export function shouldFireReloadFloor(args: {
    currentPathname: string;
    targetPathname: string;
    superseded: boolean;
}): boolean {
    if (args.superseded) return false;
    return (
        normalizeSoftNavReloadPathname(args.currentPathname) !==
        normalizeSoftNavReloadPathname(args.targetPathname)
    );
}

export type SoftNavReloadFloorDeps = {
    /** Current URL path (e.g. `window.location.pathname`). */
    getPathname: () => string;
    /** Guaranteed hard recovery (e.g. `adminV2CommitNavigation` → `window.location.assign`). */
    reload: () => void;
    setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
    timeoutMs?: number;
};

/**
 * Arm the reload floor after a soft commit. Returns a disarm function (not required — the
 * generation check makes a late fire a no-op on success or supersession).
 */
export function armSoftNavReloadFloor(
    targetPathname: string,
    deps: SoftNavReloadFloorDeps,
): () => void {
    const myGeneration = ++softNavGeneration;
    const setT = deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    const clearT = deps.clearTimeoutFn ?? ((h) => clearTimeout(h));
    const timeoutMs = deps.timeoutMs ?? DEFAULT_SOFT_NAV_RELOAD_FLOOR_MS;
    // A newer navigation OWNS the floor — cancel the prior watchdog's timer outright so stale timers
    // never accumulate (defense-in-depth alongside the generation guard below).
    cancelActiveReloadFloorTimer();
    const handle = setT(() => {
        activeTimerHandle = null;
        activeTimerClear = null;
        if (
            shouldFireReloadFloor({
                currentPathname: deps.getPathname(),
                targetPathname,
                superseded: myGeneration !== softNavGeneration,
            })
        ) {
            // Attribution: a floor fire IS the "unexpected reload". It was silent, so an operator
            // reload could never be traced. Surface it (dev/staging) with the stalled target + budget
            // so a genuine hang is distinguishable from a threshold that needs tuning.
            if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
                console.warn("[soft-nav-reload-floor] fired — soft nav never reached target", {
                    target: targetPathname,
                    current: deps.getPathname(),
                    timeout_ms: timeoutMs,
                });
            }
            deps.reload();
        }
    }, timeoutMs);
    activeTimerHandle = handle;
    activeTimerClear = clearT;
    return () => {
        clearT(handle);
        if (activeTimerHandle === handle) {
            activeTimerHandle = null;
            activeTimerClear = null;
        }
    };
}

/** Test-only reset. */
export function resetSoftNavGenerationForTests(): void {
    softNavGeneration = 0;
    activeTimerHandle = null;
    activeTimerClear = null;
}
