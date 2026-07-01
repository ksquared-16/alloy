/** Canonical Qualification lifecycle status (enrollment pipeline). */
export const QUALIFICATION_STATUS_KEY = "qualification";

/** Legacy status retained for historical records — not lifecycle doctrine. */
export const LEGACY_CONTACT_ATTEMPTED_STATUS_KEY = "contact_attempted";

/** Pipeline stages where universal comms/record actions are visible (excludes lost). */
export const UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS = [
    "new_inquiry",
    QUALIFICATION_STATUS_KEY,
    LEGACY_CONTACT_ATTEMPTED_STATUS_KEY,
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
    "enrolled",
] as const;

/** Stages where mark_lost remains available (excludes enrolled/active). */
export const MARK_LOST_VISIBLE_STATUS_KEYS = [
    "new_inquiry",
    QUALIFICATION_STATUS_KEY,
    LEGACY_CONTACT_ATTEMPTED_STATUS_KEY,
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
] as const;

/** Enrollment+ stages for upload_document (scoped universal). */
export const UPLOAD_DOCUMENT_VISIBLE_STATUS_KEYS = [
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
    "enrolled",
] as const;

export const TERMINAL_PIPELINE_STATUS_KEYS = ["lost"] as const;
