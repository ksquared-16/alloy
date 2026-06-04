import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { warmRelatedDrawerViewModels } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";

export function warmRelatedDrawerTargetsAfterVmApply(params: {
    drawer: AdminDrawerState;
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    runtime: "opportunity" | "person" | "child";
}): void {
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    logDrawerVmRuntime("related_prefetch_start", {
        runtime: params.runtime,
        entity_type: params.entityType,
        entity_id: String(params.record.id ?? params.drawer.id ?? ""),
    });
    warmRelatedDrawerViewModels({
        entityType: params.entityType,
        record: params.record,
        context: {
            departmentId: params.drawer.opportunityWorkspaceContext?.department_id ?? null,
            workUnitId: params.drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
        },
        opportunityWorkspaceContext: params.drawer.opportunityWorkspaceContext ?? null,
    });
    const elapsedMs =
        typeof performance !== "undefined" ?
            Math.round(performance.now() - startedAt)
        :   0;
    logDrawerVmRuntime("related_prefetch_ready", {
        runtime: params.runtime,
        entity_type: params.entityType,
        entity_id: String(params.record.id ?? params.drawer.id ?? ""),
        related_prefetch_ms: elapsedMs,
    });
}
