/**
 * Client-only drawer VM runtime diagnostics.
 * Search browser console for `[drawer_vm_runtime:*]`.
 */

export type DrawerVmRuntimeLogEvent =
    | "mounted"
    | "cold_fetch_start"
    | "cold_fetch_ready"
    | "payload_ready"
    | "swap_cache_hit"
    | "swap_fetch_start"
    | "swap_committed"
    | "swap_hold_current"
    | "legacy_fetch_blocked"
    | "related_prefetch_start"
    | "related_prefetch_ready"
    | "render"
    | "swap_hold"
    /** @deprecated use cold_fetch_start */
    | "cold_fetch";

export function logDrawerVmRuntime(
    event: DrawerVmRuntimeLogEvent,
    payload: Record<string, unknown> = {}
): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info(`[drawer_vm_runtime:${event}]`, {
        ts: new Date().toISOString(),
        ...payload,
    });
}

/** Vercel/server — VM API compose and cache only (not UI flicker). */
export function logDrawerVmRuntimeServer(
    event: "compose_start" | "compose_ok" | "compose_skip" | "compose_error",
    payload: Record<string, unknown>
): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info(`[drawer_vm_runtime_server:${event}]`, {
        ts: new Date().toISOString(),
        ...payload,
    });
}
