import type { OpportunityDrawerIntentContext } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { tracePlatformPrefetch } from "@/lib/perf/platformSurfacePerfTrace";

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

/** Warm first N visible opportunity queue rows after lane reveal. */
export function warmVisibleQueueRowOpportunityVms(
    opportunityIds: string[],
    workspaceContext: OpportunityDrawerIntentContext | null | undefined,
    cap: number = QUEUE_ROW_VM_WARM_CAP
): void {
    const unique = [...new Set(opportunityIds.map((id) => id.trim()).filter(Boolean))].slice(0, cap);
    for (const id of unique) {
        warmQueueRowOpportunityVm(id, workspaceContext, "wu_visible_rows");
    }
}
