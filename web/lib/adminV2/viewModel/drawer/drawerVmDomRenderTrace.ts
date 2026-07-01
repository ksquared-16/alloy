/**
 * DOM/render-level trace for drawer VM cutover — complements state-only diagnostics.
 * Search console for `[drawer_vm_dom_render_trace]`.
 */

import type { DrawerRuntimePhase } from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerVmDomRenderSnapshot = {
    opportunity_id: string | null;
    drawer_transition_id: number;
    drawer_runtime_phase: DrawerRuntimePhase;
    /** @deprecated Use drawer_transition_id — kept for log continuity. */
    drawer_model_swap_generation: number;
    /** Header opportunity status control */
    status_control: "missing" | "skeleton" | "select" | "readonly";
    status_vm_attr: boolean;
    /** Body loading / gate surfaces */
    operational_loading: boolean;
    composed_preparing: boolean;
    drawer_body_gate_skeleton: boolean;
    person_preparing: boolean;
    person_loading_text: boolean;
    queue_nav_overlay: boolean;
    /** Inquiry summary right column */
    right_column_present: boolean;
    task_preview_skeleton: boolean;
    task_preview_rows: number;
    reminder_skeleton: boolean;
    reminder_chips: number;
};

function queryDrawerRoot(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>('[data-adminv2-drawer="true"]');
}

export function captureDrawerVmDomRenderSnapshot(params: {
    opportunityId: string | null;
    drawerTransitionId: number;
    drawerRuntimePhase: DrawerRuntimePhase;
}): DrawerVmDomRenderSnapshot {
    const root = queryDrawerRoot();
    if (!root) {
        return {
            opportunity_id: params.opportunityId,
            drawer_transition_id: params.drawerTransitionId,
            drawer_runtime_phase: params.drawerRuntimePhase,
            drawer_model_swap_generation: params.drawerTransitionId,
            status_control: "missing",
            status_vm_attr: false,
            operational_loading: false,
            composed_preparing: false,
            drawer_body_gate_skeleton: false,
            person_preparing: false,
            person_loading_text: false,
            queue_nav_overlay: false,
            right_column_present: false,
            task_preview_skeleton: false,
            task_preview_rows: 0,
            reminder_skeleton: false,
            reminder_chips: 0,
        };
    }

    const statusSkeleton = root.querySelector('[data-opportunity-status-skeleton="true"]');
    const statusSelect = root.querySelector(
        '[data-opportunity-drawer-vm-status-control="true"] select, [data-opportunity-drawer-vm-status-control="true"]'
    );
    const statusVmAttr = root.querySelector('[data-opportunity-drawer-vm-status-control="true"]') != null;

    let status_control: DrawerVmDomRenderSnapshot["status_control"] = "missing";
    if (statusSkeleton) status_control = "skeleton";
    else if (statusVmAttr && root.querySelector('[data-opportunity-drawer-vm-status-control="true"] select')) {
        status_control = "select";
    } else if (statusVmAttr) {
        status_control = "readonly";
    }

    const rightCol = root.querySelector('[data-inquiry-summary-right-column="true"]');
    const taskSkeleton = root.querySelector('[data-inquiry-summary-task-preview-skeleton="true"]');
    const taskRows = root.querySelectorAll('[data-inquiry-summary-task-preview-row]').length;
    const reminderSkeleton = root.querySelector('[data-reminders-row-skeleton="true"]');
    const reminderChips = root.querySelectorAll(
        '[data-operational-scheduled-send-chip], [data-operational-next-follow-up="true"]'
    ).length;

    return {
        opportunity_id: params.opportunityId,
        drawer_transition_id: params.drawerTransitionId,
        drawer_runtime_phase: params.drawerRuntimePhase,
        drawer_model_swap_generation: params.drawerTransitionId,
        status_control,
        status_vm_attr: statusVmAttr,
        operational_loading: root.querySelector('[data-opportunity-drawer-operational-loading="true"]') != null,
        composed_preparing: root.querySelector('[data-opportunity-drawer-composed-preparing="true"]') != null,
        drawer_body_gate_skeleton: root.querySelector('[data-adminv2-drawer-record-gate-skeleton="true"]') != null,
        person_preparing:
            root.querySelector('[data-person-drawer-child-preparing="true"]') != null ||
            root.querySelector('[data-person-drawer-parent-preparing="true"]') != null,
        person_loading_text: root.querySelector('[data-person-drawer-pending="true"]') != null,
        queue_nav_overlay: root.querySelector('[data-opportunity-drawer-queue-nav-pending="true"]') != null,
        right_column_present: rightCol != null,
        task_preview_skeleton: taskSkeleton != null,
        task_preview_rows: taskRows,
        reminder_skeleton: reminderSkeleton != null,
        reminder_chips: reminderChips,
    };
}

function snapshotSignature(s: DrawerVmDomRenderSnapshot): string {
    return [
        s.opportunity_id,
        s.drawer_transition_id,
        s.drawer_runtime_phase,
        s.status_control,
        s.status_vm_attr ? "1" : "0",
        s.operational_loading ? "1" : "0",
        s.composed_preparing ? "1" : "0",
        s.drawer_body_gate_skeleton ? "1" : "0",
        s.person_preparing ? "1" : "0",
        s.person_loading_text ? "1" : "0",
        s.queue_nav_overlay ? "1" : "0",
        s.right_column_present ? "1" : "0",
        s.task_preview_skeleton ? "1" : "0",
        s.task_preview_rows,
        s.reminder_skeleton ? "1" : "0",
        s.reminder_chips,
    ].join("|");
}

let lastSignature: string | null = null;

export function logDrawerVmDomRenderTrace(
    reason: string,
    params: {
        opportunityId: string | null;
        drawerTransitionId: number;
        drawerRuntimePhase: DrawerRuntimePhase;
    }
): void {
    const snapshot = captureDrawerVmDomRenderSnapshot(params);
    const sig = snapshotSignature(snapshot);
    if (sig === lastSignature && reason !== "force") return;
    lastSignature = sig;
    if (!perfDebugTraceEnabled()) return;
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    perfDrawer("dom_render_trace", {
        entity_type: "opportunity",
        entity_id: params.opportunityId ?? undefined,
        detail: reason,
        source: "ui",
    });
}

export function resetDrawerVmDomRenderTrace(): void {
    lastSignature = null;
}
