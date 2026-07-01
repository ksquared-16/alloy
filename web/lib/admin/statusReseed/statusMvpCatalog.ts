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

/** OCM keys preserved; labels updated only. */
export const STATUS_RESEED_OCM_ENROLLMENT_STATUSES: StatusReseedRow[] = [
    { status_key: "new_inquiry", status_label: "New Lead", sort_order: 10 },
    { status_key: "needs_qualification", status_label: "Contacting", sort_order: 20 },
    { status_key: "qualified", status_label: "Qualified", sort_order: 30 },
    { status_key: "tour_requested", status_label: "Tour Requested", sort_order: 40 },
    { status_key: "tour_scheduled", status_label: "Tour Scheduled", sort_order: 50 },
    { status_key: "tour_completed", status_label: "Tour Completed", sort_order: 60 },
    { status_key: "decision_pending", status_label: "Decision Pending", sort_order: 70 },
    { status_key: "waitlisted", status_label: "Waiting", sort_order: 80 },
    { status_key: "waitlist_paused", status_label: "Waiting Paused", sort_order: 90 },
    { status_key: "offer_pending", status_label: "Offer Pending", sort_order: 100 },
    { status_key: "registration_pending", status_label: "Registration Pending", sort_order: 110 },
    { status_key: "paperwork_pending", status_label: "Paperwork Pending", sort_order: 120 },
    { status_key: "start_date_scheduled", status_label: "Start Date Scheduled", sort_order: 130 },
    { status_key: "enrolled", status_label: "Enrolled", sort_order: 140 },
    { status_key: "not_enrolling", status_label: "Not Enrolling", sort_order: 150 },
    { status_key: "interested", status_label: "Interested", sort_order: 160 },
    { status_key: "enrolling", status_label: "Enrolling", sort_order: 170 },
    { status_key: "deferred", status_label: "Deferred", sort_order: 180 },
    { status_key: "family_withdrew", status_label: "Family Withdrew", sort_order: 190 },
    { status_key: "not_moving_forward", status_label: "Not Moving Forward", sort_order: 200 },
    { status_key: "not_a_fit", status_label: "Not a Fit", sort_order: 210 },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 220 },
    { status_key: "aged_out", status_label: "No Longer Eligible", sort_order: 230 },
];

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
