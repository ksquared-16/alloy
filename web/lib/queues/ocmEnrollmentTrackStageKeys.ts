/**
 * Enrollment stage ↔ disposition keys for OCM enrollment-track queue builders.
 * Aligns with enrollment_lifecycle_status_matrix §6.1 + legacy convergence keys.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStageBindings";

/** Operator stage labels for queue row context. */
export const ENROLLMENT_OPERATOR_STAGE_LABELS: Record<LifecycleOperatorStage, string> = {
    lead: "Lead",
    qualification: "Qualification",
    tour: "Tour",
    waitlist: "Waitlist",
    enrollment: "Enrolling",
    enrolled: "Enrolled",
};

/** Extended tour dispositions from status matrix (plus legacy bindings). */
const TOUR_OCM_STATUS_KEYS = [
    "tour_requested",
    "tour_scheduled",
    "tour_completed",
    "decision_pending",
    "follow_up_attempted",
    "tour_no_show",
] as const;

const ENROLLING_OCM_STATUS_KEYS = [
    "offer_pending",
    "registration_pending",
    "paperwork_pending",
    "start_date_scheduled",
    "enrolling",
    "ready_to_enroll",
] as const;

const ENROLLED_OCM_STATUS_KEYS = ["enrolled"] as const;

export type OcmEnrollmentTrackStage = "tour" | "enrolling" | "enrolled";

export function ocmStatusKeysForEnrollmentTrackStage(stage: OcmEnrollmentTrackStage): readonly string[] {
    switch (stage) {
        case "tour":
            return TOUR_OCM_STATUS_KEYS;
        case "enrolling":
            return ENROLLING_OCM_STATUS_KEYS;
        case "enrolled":
            return ENROLLED_OCM_STATUS_KEYS;
        default:
            return [];
    }
}

/** Map executable queue key → OCM enrollment track stage when Phase A builders apply. */
export function resolveOcmEnrollmentTrackStageForQueueKey(queueKey: string): OcmEnrollmentTrackStage | null {
    const key = queueKey.trim();
    switch (key) {
        case "tours":
        case "tours_follow_up":
            return "tour";
        case "enrollment_offers":
            return "enrolling";
        case "enrollment_completed":
            return "enrolled";
        default:
            return null;
    }
}

/** Legacy case-status keys for the same operator stage (reference / transitional). */
export function legacyCaseStatusKeysForStage(stage: OcmEnrollmentTrackStage): readonly string[] {
    switch (stage) {
        case "tour":
            return ENROLLMENT_STAGE_STATUS_KEYS.tour;
        case "enrolling":
            return ENROLLMENT_STAGE_STATUS_KEYS.enrollment;
        case "enrolled":
            return ENROLLMENT_STAGE_STATUS_KEYS.enrolled;
        default:
            return [];
    }
}

export function enrollmentOperatorStageLabel(stage: OcmEnrollmentTrackStage): string {
    switch (stage) {
        case "tour":
            return ENROLLMENT_OPERATOR_STAGE_LABELS.tour;
        case "enrolling":
            return ENROLLMENT_OPERATOR_STAGE_LABELS.enrollment;
        case "enrolled":
            return ENROLLMENT_OPERATOR_STAGE_LABELS.enrolled;
        default:
            return stage;
    }
}
