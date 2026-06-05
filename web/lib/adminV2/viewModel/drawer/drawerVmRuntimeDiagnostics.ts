/**
 * Structured runtime diagnostics for drawer VM cutover verification on staging.
 * Search browser/server logs for these event keys.
 */

export type DrawerVmRuntimeDiagnosticEvent =
    | "drawer_vm_model_swap_prepare"
    | "drawer_vm_model_swap_cache_hit"
    | "model_swap_cache_hit"
    | "model_swap_cache_miss"
    | "model_swap_commit"
    | "drawer_vm_model_swap_apply"
    | "related_prefetch_start"
    | "related_prefetch_ready"
    | "related_prefetch_error"
    | "related_graph_warm_start"
    | "related_graph_warm_ready"
    | "related_graph_warm_error"
    | "drawer_target_cache_hit"
    | "drawer_target_cache_miss"
    | "back_to_lead_cache_hit"
    | "back_to_lead_cache_miss"
    | "queue_row_vm_warm_start"
    | "queue_row_vm_warm_ready"
    | "queue_row_vm_warm_error"
    | "queue_row_open_cache_hit"
    | "queue_row_open_cache_miss"
    | "lane_payload_cache_hit"
    | "lane_payload_cache_miss"
    | "row_actions_ready"
    | "model_swap_prepare_error"
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
