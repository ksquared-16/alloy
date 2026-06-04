/**
 * Client-only drawer VM runtime diagnostics.
 * Search browser console for `[drawer_vm_runtime:*]`.
 */

export type DrawerVmRuntimeLogEvent =
    | "mounted"
    | "cold_fetch"
    | "payload_ready"
    | "swap_cache_hit"
    | "swap_fetch_start"
    | "swap_committed"
    | "legacy_path_blocked"
    | "render"
    | "swap_hold";

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
