/**
 * @deprecated Legacy enrollment OCM stage helpers — runtime should use
 * builder queue_membership_v1 + resolveChildTrackLaneFromMembership.
 * Kept for scripts and transitional imports only.
 */

import {
    legacyChildTrackLaneForQueueKey,
    legacyOcmDispositionKeysForStage,
    legacyProcessStageKeyForQueueKey,
    legacyProcessStageLabel,
} from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";

/** @deprecated Use builder stage keys (string) instead. */
export type OcmEnrollmentTrackStage = "tour" | "enrolling" | "enrolled";

/** @deprecated */
export function ocmStatusKeysForEnrollmentTrackStage(stage: OcmEnrollmentTrackStage): readonly string[] {
    return legacyOcmDispositionKeysForStage(stage);
}

/** @deprecated */
export function resolveOcmEnrollmentTrackStageForQueueKey(queueKey: string): OcmEnrollmentTrackStage | null {
    const key = legacyProcessStageKeyForQueueKey(queueKey);
    if (key === "tour" || key === "enrolling" || key === "enrolled") return key;
    return null;
}

/** @deprecated */
export function enrollmentOperatorStageLabel(stage: OcmEnrollmentTrackStage): string {
    return legacyProcessStageLabel(stage);
}
