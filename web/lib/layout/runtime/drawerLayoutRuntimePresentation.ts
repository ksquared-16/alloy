/**
 * Shared presentation resolver for drawer layout runtime body loading states.
 */

export type DrawerLayoutRuntimeBodyPhase = "idle" | "loading" | "ready" | "fallback";

export type DrawerLayoutRuntimeBodyPresentation = "vm" | "hold" | "layout";

/** Max coordinated hold before falling back to VM body when layout fetch hangs. */
export const DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS = 1750;

export function resolveDrawerLayoutRuntimeBodyPresentation(input: {
    cutoverEnabled: boolean;
    phase: DrawerLayoutRuntimeBodyPhase;
}): DrawerLayoutRuntimeBodyPresentation {
    if (!input.cutoverEnabled) return "vm";
    if (input.phase === "ready") return "layout";
    if (input.phase === "fallback") return "vm";
    return "hold";
}

export function shouldFallbackDrawerLayoutFetchOnTimeout(input: {
    cutoverEnabled: boolean;
    phase: DrawerLayoutRuntimeBodyPhase;
    fetchStartedAtMs: number | null;
    nowMs?: number;
}): boolean {
    if (!input.cutoverEnabled) return false;
    if (input.phase !== "loading" && input.phase !== "idle") return false;
    if (input.fetchStartedAtMs == null) return false;
    const now = input.nowMs ?? Date.now();
    return now - input.fetchStartedAtMs >= DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS;
}
