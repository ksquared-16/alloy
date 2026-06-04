import { composeWorkUnitViewModel } from "@/lib/adminV2/viewModel/workUnit/composeWorkUnitViewModel";
import type { ComposeWorkUnitViewModelInput } from "@/lib/adminV2/viewModel/workUnit/types";
import { logWorkUnitVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/workUnit/workUnitVmRuntimeDiagnostics";
import { adminV2WorkUnitViewModelShadowEnabled } from "@/lib/adminV2/viewModel/workUnit/workUnitVmShadowGate";
import {
    assembleLiveWorkUnitShadowSnapshot,
    extractWorkUnitViewModelShadowSnapshot,
} from "@/lib/adminV2/viewModel/workUnit/shadow/assembleLiveWorkUnitShadowSnapshot";
import { diffWorkUnitViewModelShadow } from "@/lib/adminV2/viewModel/workUnit/shadow/diffWorkUnitViewModelShadow";

export type RunWorkUnitViewModelShadowParams = ComposeWorkUnitViewModelInput & {
    firstPaintSettled: boolean;
};

/** Non-blocking shadow — never changes page ownership. */
export function scheduleWorkUnitViewModelShadow(params: RunWorkUnitViewModelShadowParams): void {
    if (!adminV2WorkUnitViewModelShadowEnabled()) return;
    void runWorkUnitViewModelShadow(params);
}

export async function runWorkUnitViewModelShadow(
    params: RunWorkUnitViewModelShadowParams
): Promise<void> {
    if (!adminV2WorkUnitViewModelShadowEnabled()) return;

    try {
        const composeStart = typeof performance !== "undefined" ? performance.now() : 0;
        const vm = composeWorkUnitViewModel(params);
        const compose_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - composeStart);

        logWorkUnitVmRuntimeDiagnostic("wu_vm_shadow_compose", {
            work_unit_id: params.workUnitId,
            department_id: params.departmentId,
            generation: vm.generation,
            compose_ms,
            first_paint_settled: vm.first_paint.settled,
        });

        const live = assembleLiveWorkUnitShadowSnapshot({
            departmentId: params.departmentId,
            workUnitId: params.workUnitId,
            selectedQueueKey: params.selectedQueueKey,
            workUnitAboveFold: params.workUnitAboveFold,
            queueModel: params.queueModel,
            kpiMetricCount: params.kpiMetrics.length,
            kpiMetricsPending: params.kpiMetricsPending,
            firstPaintSettled: params.firstPaintSettled,
            laneRevealState: params.queueLaneRevealState,
            queueRowsLoading: params.queueItemsLoading,
        });
        const vmSnap = extractWorkUnitViewModelShadowSnapshot(vm);
        const diff = diffWorkUnitViewModelShadow(live, vmSnap);

        logWorkUnitVmRuntimeDiagnostic("wu_vm_shadow_diff", {
            work_unit_id: params.workUnitId,
            department_id: params.departmentId,
            generation: vm.generation,
            mismatch_count: diff.mismatch_count,
            mismatches: diff.mismatches.slice(0, 12),
        });
    } catch (err) {
        logWorkUnitVmRuntimeDiagnostic("wu_vm_shadow_diff", {
            work_unit_id: params.workUnitId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
