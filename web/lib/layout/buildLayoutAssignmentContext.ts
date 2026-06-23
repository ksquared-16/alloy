/**
 * Build LayoutAssignmentContext for runtime resolution from record/lane metadata.
 */

import type { LayoutAssignmentContext } from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { buildLayoutAssignmentContext } from "@/lib/layout/resolveLayoutAssignmentContext";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";

export { buildLayoutAssignmentContext } from "@/lib/layout/resolveLayoutAssignmentContext";

/** Derive operator stage from a work-unit drill key (pipeline lane). */
export function stageKeyFromQueueDrillWorkUnitKey(workUnitKey: string | null | undefined): string | null {
    const key = workUnitKey?.trim();
    if (!key) return null;

    if (isLifecycleStageWorkUnitKey(key)) {
        const suffix = key.slice("lifecycle_wu_".length);
        return suffix || null;
    }

    const stages = operatorStageKeysForPipelineQueueKey(key);
    return stages[0] ?? null;
}

export function layoutAssignmentContextFromQueueLane(input: {
    businessProcessKey?: string | null;
    stageKey?: string | null;
    drillWorkUnitKey?: string | null;
    lifecycleKey?: string | null;
}): LayoutAssignmentContext | undefined {
    const businessProcessKey =
        input.businessProcessKey?.trim()
        || input.lifecycleKey?.trim()
        || null;

    const stageKey =
        input.stageKey?.trim()
        || stageKeyFromQueueDrillWorkUnitKey(input.drillWorkUnitKey)
        || null;

    return buildLayoutAssignmentContext({ businessProcessKey, stageKey, statusKey: null });
}

export { stageKeyFromLifecycleWorkUnitMetadata };
