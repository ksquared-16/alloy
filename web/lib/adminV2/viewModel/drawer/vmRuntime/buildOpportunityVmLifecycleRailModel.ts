import { resolveBuilderLifecycleDrawerRailModel } from "@/lib/admin/drawer/resolveBuilderLifecycleDrawerRailModel";
import { resolveRecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import type { RecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import { resolveWorkUnitQueueDefinitionForDrawer } from "@/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

export function opportunityVmLifecycleQueueDefinition(
    vm: OpportunityDrawerViewModel | null | undefined
) {
    return resolveWorkUnitQueueDefinitionForDrawer(vm?.workspace?.queue_definition);
}

function builderLifecycleRailModel(
    vm: OpportunityDrawerViewModel | null | undefined
): RecordLifecycleRailModel | null {
    const rail = vm?.workspace.lifecycle_rail;
    if (!rail?.stages?.length) return null;
    return resolveBuilderLifecycleDrawerRailModel({
        stages: rail.stages,
        currentStageKey: rail.current_stage_key,
    });
}

/**
 * Config-driven lifecycle rail — queue_definition lanes when multi-lane; else builder stage order from dept metadata.
 */
export function buildOpportunityVmLifecycleRailModel(params: {
    displayVm: OpportunityDrawerViewModel | null | undefined;
    drawerId: string | null | undefined;
}): RecordLifecycleRailModel | null {
    if (!params.displayVm || !params.drawerId || params.drawerId === "new") return null;

    const rec = params.displayVm.above_fold.record ?? {};
    const currentStatus = String(rec.status_key ?? "").trim() || null;
    const queueDefinition = opportunityVmLifecycleQueueDefinition(params.displayVm);
    const queueModel =
        queueDefinition ?
            resolveRecordLifecycleRailModel({
                queueDefinition,
                currentStatusKey: currentStatus,
            })
        :   null;

    if (queueModel && queueModel.steps.length > 1) return queueModel;

    const builderModel = builderLifecycleRailModel(params.displayVm);
    if (builderModel && builderModel.steps.length > 1) return builderModel;

    return queueModel ?? builderModel;
}
