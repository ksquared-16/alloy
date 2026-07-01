/**
 * Gated hard-trace for drawer debug UI + child link path diagnosis.
 * Enable: NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG=1
 */
import { drawerRuntimeDebugEnabled } from "@/lib/adminV2/drawer/drawerRuntimeDebug";
import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerHardTraceEvent =
    | "debug_ui_render_blocked"
    | "child_click"
    | "child_open_prepare"
    | "child_open_view_person"
    | "child_model_swap_start"
    | "child_model_swap_commit"
    | "child_model_swap_fail"
    | "child_pending_begin"
    | "child_pending_clear"
    | "back_to_lead";

export function drawerHardTraceEnabled(): boolean {
    return drawerRuntimeDebugEnabled();
}

export function logDrawerHardTrace(
    event: DrawerHardTraceEvent,
    sourceFile: string,
    payload: Record<string, unknown> = {}
): void {
    if (!drawerHardTraceEnabled() && !perfDebugTraceEnabled()) return;
    perfDrawer(`debug_${event}`, {
        source: sourceFile,
        entity_id: payload.person_id ?? payload.child_id ?? payload.opportunity_id ?? payload.entity_id,
        entity_type: payload.entity_type,
        detail: event,
    });
}
