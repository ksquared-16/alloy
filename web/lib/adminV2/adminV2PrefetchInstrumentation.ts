/**
 * AdminV2 above-fold prefetch instrumentation — filter console with `[prefetch.adminv2]`.
 */

export type AdminV2PrefetchSurface =
    | "workspace"
    | "department"
    | "work_unit"
    | "drawer_primary"
    | "drawer_full";

export type AdminV2PrefetchOutcome = "start" | "hit" | "miss" | "inflight_join" | "complete" | "error" | "skipped";

export function logPrefetchAdminV2(
    surface: AdminV2PrefetchSurface,
    outcome: AdminV2PrefetchOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window === "undefined") return;
    console.info("[prefetch.adminv2]", {
        surface,
        outcome,
        at_ms: typeof performance !== "undefined" ? Math.round(performance.now()) : null,
        ...detail,
    });
}
