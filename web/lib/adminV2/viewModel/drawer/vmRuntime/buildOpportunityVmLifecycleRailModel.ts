import { resolveRecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import type { RecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

export function opportunityVmLifecycleQueueDefinition(
    vm: OpportunityDrawerViewModel | null | undefined
): QueueDefinitionV1 | null {
    const qd = vm?.workspace?.queue_definition;
    if (!qd || typeof qd !== "object") return null;
    return qd as QueueDefinitionV1;
}

/**
 * Config-driven lifecycle rail for Opportunity VM — uses workspace queue_definition only.
 * No enrollment pipeline fallback.
 */
export function buildOpportunityVmLifecycleRailModel(params: {
    displayVm: OpportunityDrawerViewModel | null | undefined;
    drawerId: string | null | undefined;
}): RecordLifecycleRailModel | null {
    if (!params.displayVm || !params.drawerId || params.drawerId === "new") return null;

    const rec = params.displayVm.above_fold.record ?? {};
    const currentStatus = String(rec.status_key ?? "").trim() || null;
    const queueDefinition = opportunityVmLifecycleQueueDefinition(params.displayVm);
    if (!queueDefinition) return null;

    return resolveRecordLifecycleRailModel({
        queueDefinition,
        currentStatusKey: currentStatus,
    });
}
