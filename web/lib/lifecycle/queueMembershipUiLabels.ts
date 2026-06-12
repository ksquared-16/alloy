/**
 * Operator-facing labels for queue_membership_v1 editor — no raw DB/table names.
 */

import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
    QueueMembershipPlacementScope,
    QueueMembershipSubjectType,
} from "@/lib/lifecycle/queueMembershipV1";

/** Field label: "This stage is for" */
export const QUEUE_MEMBERSHIP_SUBJECT_FIELD_LABEL = "This stage is for";

export const QUEUE_MEMBERSHIP_SUBJECT_LABELS: Record<QueueMembershipSubjectType, string> = {
    case: "Families / leads",
    child: "Children in enrollment",
    candidate: "Waitlist candidates",
};

/** Field label: "Rows are counted by" */
export const QUEUE_MEMBERSHIP_COUNT_UNIT_FIELD_LABEL = "Rows are counted by";

export const QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS: Record<QueueMembershipCountUnit, string> = {
    cases: "Family",
    enrollment_tracks: "Child",
    children: "Child",
    candidates: "Candidate",
};

export const QUEUE_MEMBERSHIP_LOCATION_SCOPE_LABELS: Record<QueueMembershipLocationScopeSource, string> = {
    case_site: "Family location",
    ocm_site: "Child location",
    placement_site: "Waitlist location",
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
            return "Family statuses";
        case "child":
            return "Enrollment statuses";
        case "candidate":
            return "Waitlist statuses";
    }
}

/** Canonical status assignment label inside Stage Membership. */
export const STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL = "Included statuses";

export const STAGE_MEMBERSHIP_INCLUDED_STATUSES_HELPER =
    "Choose status categories and the statuses that roll up into this stage.";

export const STAGE_MEMBERSHIP_INCLUDED_STATUSES_EMPTY =
    "No enrollment statuses are configured for this stage.";

/** Summary label for count unit in stage header. */
export function countUnitSummaryLabel(countUnit: QueueMembershipCountUnit): string {
    return `Rows counted by ${QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS[countUnit].toLowerCase()}`;
}
