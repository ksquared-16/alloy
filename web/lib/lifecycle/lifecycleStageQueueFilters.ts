/**
 * Lifecycle stage work unit queue status filters — must be non-empty when statuses are assigned.
 */

import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { queueStatusKeysForLifecycleWorkUnitValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";

export class LifecycleStageQueueFiltersEmptyError extends Error {
    readonly code = "LIFECYCLE_QUEUE_FILTERS_EMPTY" as const;

    constructor(stageKey: string, detail?: string) {
        super(
            detail ??
                `Stage "${stageKey}" has no status filters on the work unit queue. Assign statuses, then save the Work Unit Queue again.`
        );
        this.name = "LifecycleStageQueueFiltersEmptyError";
    }
}

/** Normalize and require at least one status key before writing queue_definition. */
export function requireLifecycleStageQueueStatusKeys(
    stageKey: string,
    statusKeys: readonly string[]
): string[] {
    const values = [...new Set(statusKeys.map((k) => String(k ?? "").trim()).filter(Boolean))];
    if (!values.length) {
        throw new LifecycleStageQueueFiltersEmptyError(stageKey.trim());
    }
    return values;
}

export function executableStatusKeysFromLifecycleQueueDefinition(
    workUnit: { key: string; queue_definition: unknown },
    stageKey: string
): string[] {
    return queueStatusKeysForLifecycleWorkUnitValidation(workUnit, stageKey);
}

export function lifecycleStageQueueHasExecutableStatusFilters(
    workUnit: { key: string; queue_definition: unknown } | null,
    stageKey: string
): boolean {
    if (!workUnit) return false;
    return executableStatusKeysFromLifecycleQueueDefinition(workUnit, stageKey).length > 0;
}

type QueryOp = { kind: string; column?: string; values?: string[]; value?: unknown };

/** Block lifecycle_visibility queries that would return unfiltered org-wide rows. */
export function assertLifecycleStageOpportunityQueryHasStatusFilters(params: {
    workUnitKey: string | null;
    opportunityScopeMode: "work_unit_id" | "lifecycle_visibility" | undefined;
    ops: readonly QueryOp[];
    workUnitMetadata: unknown | null;
}): void {
    const key = (params.workUnitKey ?? "").trim().toLowerCase();
    const lifecycleStage =
        isLifecycleStageWorkUnitKey(key) || params.opportunityScopeMode === "lifecycle_visibility";
    if (!lifecycleStage) return;

    const hasStatusOp = params.ops.some(
        (op) =>
            op.kind === "in" &&
            op.column === "status_key" &&
            Array.isArray(op.values) &&
            op.values.length > 0
    );
    if (hasStatusOp) return;

    // Post status-collapse: case-grain builder membership filters by stage_key (not legacy status keys).
    const hasStageEq = params.ops.some((op) => {
        if (op.kind !== "eq" || op.column !== "stage_key") return false;
        return typeof op.value === "string" ? op.value.trim().length > 0 : Boolean(op.value);
    });
    if (hasStageEq) return;

    // Tour lane: membership is active tour_bookings → opportunity id IN (Waitlist ∩ Tours overlap).
    const hasOpportunityIdIn = params.ops.some(
        (op) =>
            op.kind === "in" &&
            op.column === "id" &&
            Array.isArray(op.values) &&
            op.values.length > 0
    );
    if (hasOpportunityIdIn) return;

    const stageKey =
        stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata) ??
        (key.startsWith("lifecycle_wu_") ? key.slice("lifecycle_wu_".length) : "stage");
    throw new LifecycleStageQueueFiltersEmptyError(
        stageKey,
        `Lifecycle stage queue "${stageKey}" has no executable status filters. Re-save statuses and Work Unit Queue in Lifecycle Builder.`
    );
}
