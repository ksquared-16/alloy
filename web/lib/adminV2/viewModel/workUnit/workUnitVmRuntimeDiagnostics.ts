/**
 * Structured runtime diagnostics for Work Unit VM cutover (WU-VM-0+).
 * Filter browser console: `[wu_vm_*]`
 */

export type WorkUnitVmRuntimeDiagnosticEvent =
    | "wu_vm_open_start"
    | "wu_vm_open_warm_cache"
    | "wu_vm_open_cold"
    | "wu_vm_bootstrap_apply"
    | "wu_vm_shell_ready"
    | "wu_vm_summaries_ready"
    | "wu_vm_queue_ready"
    | "wu_vm_kpi_ready"
    | "wu_vm_first_paint_ready"
    | "wu_vm_pill_switch_start"
    | "wu_vm_pill_switch_cache_hit"
    | "wu_vm_pill_switch_apply"
    | "wu_vm_shadow_compose"
    | "wu_vm_shadow_diff";

export function logWorkUnitVmRuntimeDiagnostic(
    event: WorkUnitVmRuntimeDiagnosticEvent,
    payload: Record<string, unknown>
): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info(`[${event}]`, {
        ts: new Date().toISOString(),
        ...payload,
    });
}
