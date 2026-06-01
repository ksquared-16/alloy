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
