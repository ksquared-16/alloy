/**
 * Structured runtime diagnostics for drawer VM — routed through `[perf:drawer]`.
 */

import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

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
    | "work_unit_row_related_targets_resolved"
    | "drawer_vm_composed_not_ready"
    | "drawer_vm_composed_legacy_miss_vm_ok";

function mapEventToPhase(event: DrawerVmRuntimeDiagnosticEvent): string {
    if (event.includes("cache_hit")) return "cache_hit";
    if (event.includes("cache_miss")) return "cache_miss";
    if (event.includes("model_swap_commit") || event.includes("model_swap_apply")) return "linked_swap_commit";
    if (event.includes("model_swap")) return "linked_swap_start";
    if (event.includes("prefetch")) return "related_prefetch";
    if (event.includes("graph_warm")) return "related_graph_warm";
    if (event.includes("status")) return "status_vm";
    return event.replace(/^drawer_vm_/, "");
}

export function logDrawerVmRuntimeDiagnostic(
    event: DrawerVmRuntimeDiagnosticEvent,
    payload: Record<string, unknown>
): void {
    if (!perfDebugTraceEnabled() && !event.includes("cache_hit") && !event.includes("cache_miss")) return;
    const entityId =
        payload.opportunity_id ?? payload.person_id ?? payload.entity_id ?? payload.target_id ?? null;
    perfDrawer(mapEventToPhase(event), {
        entity_type: payload.entity_type ?? (payload.opportunity_id != null ? "opportunity" : undefined),
        entity_id: entityId != null ? String(entityId) : undefined,
        cache_hit: event.includes("cache_hit") ? true : event.includes("cache_miss") ? false : undefined,
        duration_ms: payload.duration_ms ?? payload.prefetch_ms,
        source: event.includes("cache_hit") ? "cache" : payload.source,
        detail: event,
    });
}
