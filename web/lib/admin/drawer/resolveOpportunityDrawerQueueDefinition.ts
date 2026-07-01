import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

/**
 * Resolve queue definition for opportunity lifecycle rail.
 * Falls back to canonical enrollment pipeline when work-unit def is missing in inquiry workflow.
 */
export function resolveOpportunityDrawerQueueDefinition(
    workUnitQueueDefinition: QueueDefinitionV1 | null,
    options?: { allowEnrollmentFallback?: boolean }
): QueueDefinitionV1 | null {
    if (workUnitQueueDefinition) return workUnitQueueDefinition;
    if (options?.allowEnrollmentFallback) {
        return ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;
    }
    return null;
}
