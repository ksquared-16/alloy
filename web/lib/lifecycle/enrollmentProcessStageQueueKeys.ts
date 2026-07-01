/**
 * Operator stage → queue keys inside `enrollment_pipeline` queue_definition v2.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export const ENROLLMENT_PIPELINE_WORK_UNIT_KEY = "enrollment_pipeline" as const;

export const ENROLLMENT_STAGE_QUEUE_KEYS: Record<LifecycleOperatorStage, readonly string[]> = {
    lead: ["new_leads"],
    qualification: ["communications_followup"],
    tour: ["tours", "tours_follow_up"],
    waitlist: ["waitlist"],
    enrollment: ["enrollment_offers"],
    enrolled: ["enrollment_completed"],
};

/** Reverse map — pipeline queue key (`new_leads`) → builder operator stage (`lead`). */
export function operatorStageKeysForPipelineQueueKey(queueKey: string): LifecycleOperatorStage[] {
    const normalized = queueKey.trim().toLowerCase();
    if (!normalized) return [];
    const out: LifecycleOperatorStage[] = [];
    for (const stage of Object.keys(ENROLLMENT_STAGE_QUEUE_KEYS) as LifecycleOperatorStage[]) {
        if (ENROLLMENT_STAGE_QUEUE_KEYS[stage].some((key) => key.toLowerCase() === normalized)) {
            out.push(stage);
        }
    }
    return out;
}

/**
 * Operator work-unit slug key for a pipeline lane / work-view queue key.
 *
 * Aligns work-view nav with the builder path: a lane keyed off any of a stage's queue keys
 * (e.g. `tours_follow_up`) routes to that stage's primary operator work unit (`tours`), so
 * operator navigation lands on the canonical `/workspace/work-unit/:slug` rather than the
 * pipeline aggregate. Returns the queue key unchanged when it is not a known pipeline lane.
 */
export function operatorWorkUnitKeyForPipelineQueueKey(queueKey: string): string | null {
    const normalized = queueKey.trim();
    if (!normalized) return null;
    const stage = operatorStageKeysForPipelineQueueKey(normalized)[0];
    if (stage) return ENROLLMENT_STAGE_QUEUE_KEYS[stage][0] ?? normalized;
    return normalized;
}
