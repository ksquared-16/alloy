import type { OpportunityDrawerIntentContext } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { tracePlatformPrefetch } from "@/lib/perf/platformSurfacePerfTrace";
import { scheduleDrawerVmPrewarm } from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { prefetchOpportunityStageWork } from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";

export const QUEUE_ROW_VM_WARM_CAP = 5;
const QUEUE_ROW_WARM_OPEN_SOURCE = "queue_row_vm_warm";

/**
 * Background warm for opportunity drawer VM from a work-unit queue row.
 */
export function warmQueueRowOpportunityVm(
    opportunityId: string,
    workspaceContext: OpportunityDrawerIntentContext | null | undefined,
    reason: string = QUEUE_ROW_WARM_OPEN_SOURCE
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;
    if (!opportunityDrawerHardCutoverEnabled()) return;
    const ws = workspaceContext ?? null;
    if (!ws?.work_unit_id || !ws?.department_id) return;

    logDrawerVmRuntimeDiagnostic("queue_row_vm_warm_start", {
        opportunity_id: id,
        reason,
        work_unit_id: ws.work_unit_id,
        department_id: ws.department_id,
    });
    tracePlatformPrefetch("queue_row_vm_warm_start", {
        opportunity_id: id,
        reason,
        work_unit_id: ws.work_unit_id,
    });

    void prepareDrawerViewModelDeduped({
        entityType: "opportunities",
        entityId: id,
        context: {
            departmentId: ws.department_id,
            workUnitId: ws.work_unit_id,
        },
        openSource: reason,
        opportunityWorkspaceContext: ws,
    })
        .then((preload) => {
            if (preload?.entityType === "opportunities") {
                // Warm the thin stage-work resource with the VM's authoritative stage key so a
                // click's Tier-2 backfill reuses THIS entry (no duplicate stage-work request). Only
                // the stage-work resource is warmed on row intent — never comms threads/activity.
                if (isOpportunityDrawerViewModelPreload(preload.preload)) {
                    const vm = preload.preload.viewModel;
                    if (vm.workspace.stage_work?.status === "pending") {
                        void prefetchOpportunityStageWork({
                            opportunityId: vm.entity.id,
                            departmentId: vm.workspace.department_id,
                            stageKey: vm.workspace.lifecycle_rail?.current_stage_key ?? null,
                            stageLabel: vm.workspace.stage_context?.stage_label ?? null,
                        });
                    }
                }
                logDrawerVmRuntimeDiagnostic("queue_row_vm_warm_ready", {
                    opportunity_id: id,
                    reason,
                });
                return;
            }
            logDrawerVmRuntimeDiagnostic("queue_row_vm_warm_error", {
                opportunity_id: id,
                reason,
                error: "prepare_returned_null",
            });
        })
        .catch((err) => {
            logDrawerVmRuntimeDiagnostic("queue_row_vm_warm_error", {
                opportunity_id: id,
                reason,
                error: err instanceof Error ? err.message : String(err),
            });
        });
}

/**
 * Warm first N visible opportunity queue rows after lane reveal.
 *
 * Background prewarm — must never compete with the primary reveal. Each row is routed through
 * {@link scheduleDrawerVmPrewarm}, which holds them until `coordinated_reveal_ready` and then
 * drains one at a time (concurrency cap = 1). Runtime flag OFF = legacy immediate fire.
 */
export function warmVisibleQueueRowOpportunityVms(
    opportunityIds: string[],
    workspaceContext: OpportunityDrawerIntentContext | null | undefined,
    cap: number = QUEUE_ROW_VM_WARM_CAP
): void {
    const unique = [...new Set(opportunityIds.map((id) => id.trim()).filter(Boolean))].slice(0, cap);
    for (const id of unique) {
        scheduleDrawerVmPrewarm({
            key: `oppvm:${id}`,
            reason: "wu_visible_rows",
            run: () => warmQueueRowOpportunityVm(id, workspaceContext, "wu_visible_rows"),
        });
    }
}
