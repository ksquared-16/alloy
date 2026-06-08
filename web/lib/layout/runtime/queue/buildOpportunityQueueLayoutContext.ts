/**
 * C4 foundation — build queue layout context from AdminV2 queue lane metadata.
 */

import type { QueueLayoutContextRequest } from "../../queueLayoutContext";

export type OpportunityQueueLaneContextInput = {
    drillWorkUnitKey?: string | null;
    lifecycleKey?: string | null;
    stageKey?: string | null;
    /** True when row is a waitlist placement candidate card. */
    isWaitlistCandidate?: boolean;
    grain?: string | null;
};

/** Map live queue lane → layout resolver queue_context. */
export function buildOpportunityQueueLayoutContext(
    input: OpportunityQueueLaneContextInput,
): QueueLayoutContextRequest {
    const work_unit_key = input.drillWorkUnitKey?.trim() || undefined;
    const stage_key = input.stageKey?.trim() || undefined;
    const lifecycle_key = input.lifecycleKey?.trim() || undefined;

    if (input.isWaitlistCandidate) {
        return {
            queue_type: "waitlist",
            grain: input.grain?.trim() || "candidate",
            work_unit_key,
            lifecycle_key,
            stage_key,
        };
    }

    return {
        queue_type: "pipeline",
        grain: input.grain?.trim() || "case",
        work_unit_key,
        lifecycle_key,
        stage_key,
    };
}

/** Entity type for waitlist candidate rows vs standard opportunity pipeline rows. */
export function opportunityQueueLayoutEntityType(isWaitlistCandidate: boolean): string {
    return isWaitlistCandidate ? "placement_candidate" : "opportunities";
}
