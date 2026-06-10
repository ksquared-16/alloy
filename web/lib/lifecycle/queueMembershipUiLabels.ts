/**
 * Operator-facing labels for queue_membership_v1 editor — no raw DB/table names.
 */

import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
    QueueMembershipPlacementScope,
    QueueMembershipSubjectType,
} from "@/lib/lifecycle/queueMembershipV1";

export const QUEUE_MEMBERSHIP_SUBJECT_LABELS: Record<QueueMembershipSubjectType, string> = {
    case: "Family case",
    child: "Child enrollment track",
    candidate: "Waitlist candidate",
};

export const QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS: Record<QueueMembershipCountUnit, string> = {
    cases: "Families/cases",
    enrollment_tracks: "Enrollment tracks",
    children: "Children",
    candidates: "Candidates",
};

export const QUEUE_MEMBERSHIP_LOCATION_SCOPE_LABELS: Record<QueueMembershipLocationScopeSource, string> = {
    case_site: "Case location",
    ocm_site: "Child enrollment location",
    placement_site: "Placement/waitlist location",
};

export const QUEUE_MEMBERSHIP_PLACEMENT_SCOPE_LABELS: Record<QueueMembershipPlacementScope, string> = {
    active_only: "Active only",
    active_and_paused: "Active and paused",
};

/** Default count unit when subject type changes in the editor. */
export function defaultCountUnitForSubject(subject: QueueMembershipSubjectType): QueueMembershipCountUnit {
    switch (subject) {
        case "case":
            return "cases";
        case "child":
            return "enrollment_tracks";
        case "candidate":
            return "candidates";
    }
}

/** Label for the included-status multi-select by subject. */
export function includedStatusFieldLabel(subject: QueueMembershipSubjectType): string {
    switch (subject) {
        case "case":
            return "Case status";
        case "child":
            return "Enrollment status";
        case "candidate":
            return "Candidate status";
    }
}

/** Summary label for count unit in stage header. */
export function countUnitSummaryLabel(countUnit: QueueMembershipCountUnit): string {
    return `Counts as ${QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS[countUnit].toLowerCase()}`;
}
