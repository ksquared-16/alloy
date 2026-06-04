/**
 * Structured runtime diagnostics for drawer VM cutover verification on staging.
 * Search browser/server logs for these event keys.
 */

export type DrawerVmRuntimeDiagnosticEvent =
    | "drawer_vm_model_swap_prepare"
    | "drawer_vm_model_swap_cache_hit"
    | "drawer_vm_model_swap_apply"
    | "drawer_vm_status_vm_seed"
    | "drawer_vm_status_non_vm_write_blocked"
    | "drawer_vm_status_defs_reconciled"
    | "drawer_vm_status_double_commit_detected"
    | "drawer_vm_status_write"
    | "work_unit_row_related_targets_resolved";

export function logDrawerVmRuntimeDiagnostic(
    event: DrawerVmRuntimeDiagnosticEvent,
    payload: Record<string, unknown>
): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info(`[${event}]`, {
        ts: new Date().toISOString(),
        ...payload,
    });
}
