/**
 * Generic queue membership resolution from stored stage/work-unit metadata.
 * No template defaults — explicit queue_membership_v1 only.
 */

import { parseQueueMembershipV1, type QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

export const QUEUE_MEMBERSHIP_STAGE_FIELD = "queue_membership_v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Read explicit queue_membership_v1 from a stage or work-unit metadata container. */
export function readQueueMembershipFromContainer(container: unknown): QueueMembershipV1 | null {
    if (!isRecord(container)) return null;
    const raw = container[QUEUE_MEMBERSHIP_STAGE_FIELD];
    if (raw === undefined) return null;
    return parseQueueMembershipV1(raw);
}

/**
 * Resolve membership for a builder stage record.
 * Returns null when stage has no valid explicit membership configured.
 */
export function resolveQueueMembershipForStage(
    stageConfig: unknown,
    _fallbackStageKey?: string,
): QueueMembershipV1 | null {
    return readQueueMembershipFromContainer(stageConfig);
}
