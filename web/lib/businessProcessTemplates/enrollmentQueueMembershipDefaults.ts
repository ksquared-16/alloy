/**
 * Enrollment template — default queue_membership_v1 per stage key.
 *
 * Used only by template apply and legacy enrollment compat bridge.
 * Generic runtime must not import this module.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

type EnrollmentMembershipSpec = Pick<
    QueueMembershipV1,
    | "subject_type"
    | "count_unit"
    | "included_disposition_keys"
    | "included_status_keys"
    | "location_scope_source"
>;

/** V2 + legacy V1 stage keys with enrollment template defaults. */
export const ENROLLMENT_TEMPLATE_STAGE_KEYS = new Set([
    "lead",
    "qualification",
    "tour",
    "decision",
    "closed",
    "waitlist",
    "enrollment",
    "enrolling",
    "enrolled",
    "closed_withdrawn",
    "new_lead",
    "contacting",
    "tour_scheduled",
    "tour_completed",
    "decision_pending",
    "closed_lost",
    "offered_spot",
    "future_start",
    "withdrawn",
]);

const ENROLLMENT_MEMBERSHIP_DEFAULTS: Record<string, EnrollmentMembershipSpec> = {
    lead: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["new_inquiry"],
    },
    qualification: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: ["needs_qualification", "qualified"],
    },
    tour: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["tour_requested", "tour_scheduled", "tour_completed"],
    },
    decision: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["decision_pending"],
    },
    closed: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["closed", "lost", "withdrawn"],
    },
    waitlist: {
        subject_type: "candidate",
        count_unit: "candidates",
        location_scope_source: "placement_site",
        included_disposition_keys: ["waitlisted", "waitlist_paused"],
    },
    enrolling: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: [
            "offer_pending",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
            "enrolling",
        ],
    },
    enrollment: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: [
            "offer_pending",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
        ],
    },
    closed_withdrawn: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["family_withdrew", "withdrawn", "closed"],
    },
    enrolled: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["enrolled"],
    },
    new_lead: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["new_inquiry"],
    },
    contacting: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: ["needs_contact", "contact_attempted"],
        included_status_keys: ["open", "contact_attempted"],
    },
    tour_scheduled: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["tour_requested", "tour_scheduled"],
    },
    tour_completed: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["tour_completed"],
    },
    decision_pending: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["decision_pending"],
    },
    closed_lost: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["closed", "lost"],
    },
    offered_spot: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["offer_pending"],
    },
    future_start: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["start_date_scheduled"],
    },
    withdrawn: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["family_withdrew", "withdrawn"],
    },
};

/** Template default queue membership for an enrollment stage key. */
export function defaultEnrollmentQueueMembershipForStage(stageKey: string): QueueMembershipV1 | null {
    const normalized = stageKey.trim();
    if (!normalized || !ENROLLMENT_TEMPLATE_STAGE_KEYS.has(normalized)) return null;

    const spec = ENROLLMENT_MEMBERSHIP_DEFAULTS[normalized];
    if (!spec) return null;

    return {
        version: 1,
        lifecycle_key: ENROLLMENT_PROCESS_KEY,
        stage_key: normalized,
        subject_type: spec.subject_type,
        count_unit: spec.count_unit,
        included_disposition_keys: [...spec.included_disposition_keys],
        ...(spec.location_scope_source ? { location_scope_source: spec.location_scope_source } : {}),
        ...(spec.included_status_keys?.length ?
            { included_status_keys: [...spec.included_status_keys] }
        :   {}),
    };
}
