import {
    buildPersonStatusApplicabilityMetadata,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
} from "@/lib/admin/person/personStatusApplicability";

export type StatusReseedRow = {
    status_key: string;
    status_label: string;
    sort_order: number;
    metadata?: Record<string, unknown>;
};

export const STATUS_RESEED_OPPORTUNITY_CASE_STATUSES: StatusReseedRow[] = [
    { status_key: "open", status_label: "Open", sort_order: 10 },
    { status_key: "closed", status_label: "Closed", sort_order: 20 },
    { status_key: "inactive", status_label: "Inactive", sort_order: 30 },
    { status_key: "archived", status_label: "Archived", sort_order: 40 },
];

export const OPPORTUNITY_CASE_STATUS_KEYS = new Set<string>(
    STATUS_RESEED_OPPORTUNITY_CASE_STATUSES.map((r) => r.status_key)
);

/** Legacy opportunity pipeline keys — deactivated when DEACTIVATE_LEGACY is enabled. */
export const STATUS_RESEED_OPPORTUNITY_LEGACY_KEYS = [
    "new",
    "new_inquiry",
    "qualification",
    "needs_qualification",
    "contact_attempted",
    "contacted",
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "tour_requested",
    "follow_up_attempted",
    "enrolling",
    "enrolled",
    "waitlisted",
    "lost",
    "application_in_progress",
    "ready_to_enroll",
    "qualified",
    "needs_a_quote",
    "conversation_had",
    "scheduled",
    "booked",
    "won",
] as const;

function personMvpRow(args: {
    status_key: string;
    person_label: string;
    child_label: string;
    sort_order: number;
}): StatusReseedRow {
    return {
        status_key: args.status_key,
        status_label: args.child_label,
        sort_order: args.sort_order,
        metadata: {
            ...buildPersonStatusApplicabilityMetadata("both"),
            labels_by_profile: {
                [PERSON_STATUS_PROFILE_GENERIC]: args.person_label,
                [PERSON_STATUS_PROFILE_CHILD_LIFECYCLE]: args.child_label,
            },
            seed_source: "status_mvp_reseed_v1",
        },
    };
}

export const STATUS_RESEED_PERSON_MVP_STATUSES: StatusReseedRow[] = [
    personMvpRow({
        status_key: "pre_enrolled",
        person_label: "Pre-Enrolled Family",
        child_label: "Pre-Enrolled",
        sort_order: 10,
    }),
    personMvpRow({
        status_key: "active",
        person_label: "Active Family",
        child_label: "Active",
        sort_order: 20,
    }),
    personMvpRow({
        status_key: "inactive",
        person_label: "Inactive Family",
        child_label: "Inactive",
        sort_order: 30,
    }),
    personMvpRow({
        status_key: "archived",
        person_label: "Archived",
        child_label: "Archived",
        sort_order: 40,
    }),
];

export const STATUS_RESEED_PERSON_LEGACY_KEYS = [
    "future_start",
    "withdrawn",
    "graduated",
] as const;

/**
 * Collapsed child enrollment disposition statuses on OCM (S4 status collapse).
 * Durable outcomes only: waitlisted | enrolling | enrolled | withdrawn | not_enrolling
 * (plus the implicit null in-process). Removed keys (offer_pending, waitlist_paused,
 * registration_pending, paperwork_pending, start_date_scheduled, family_withdrew,
 * not_moving_forward, aged_out, tour_*, decision_pending, new_inquiry, …) are deactivated.
 */
export const STATUS_RESEED_OCM_ENROLLMENT_STATUSES: StatusReseedRow[] = [
    { status_key: "waitlisted", status_label: "Waitlisted", sort_order: 10 },
    { status_key: "enrolling", status_label: "Enrolling", sort_order: 20 },
    { status_key: "enrolled", status_label: "Enrolled", sort_order: 30 },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 40 },
    { status_key: "not_enrolling", status_label: "Not Enrolling", sort_order: 50 },
];

/** Legacy OCM enrollment keys removed by the S4 status collapse — deactivate on reseed. */
export const STATUS_RESEED_OCM_ENROLLMENT_LEGACY_KEYS = [
    "new_inquiry",
    "needs_qualification",
    "qualified",
    "tour_requested",
    "tour_scheduled",
    "tour_completed",
    "decision_pending",
    "waitlist_paused",
    "offer_pending",
    "registration_pending",
    "paperwork_pending",
    "start_date_scheduled",
    "interested",
    "deferred",
    "family_withdrew",
    "not_moving_forward",
    "not_a_fit",
    "aged_out",
] as const;

export const OPPORTUNITY_LEGACY_STATUS_BACKFILL_TO_OPEN = [
    ...STATUS_RESEED_OPPORTUNITY_LEGACY_KEYS,
] as const;

export const PERSON_LEGACY_STATUS_BACKFILL_TO_PRE_ENROLLED = ["active", "future_start"] as const;

export const PERSON_LEGACY_STATUS_BACKFILL_MAP: Record<string, string> = {
    active: "pre_enrolled",
    future_start: "pre_enrolled",
    withdrawn: "inactive",
    graduated: "archived",
};
