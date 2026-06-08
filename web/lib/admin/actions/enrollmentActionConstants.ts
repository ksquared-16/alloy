/** Enrollment-stage opportunity status keys for canonical action placement conditions. */
export const ENROLLMENT_PACKET_ACTION_STATUS_KEYS = [
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
] as const;

/** Stages where placement field-focus actions apply (child OCM edits). */
export const ENROLLMENT_PLACEMENT_FOCUS_STATUS_KEYS = [
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
] as const;

/** Stages where packet review action is surfaced (pending session gating is runtime). */
export const ENROLLMENT_REVIEW_PACKET_STATUS_KEYS = [
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
] as const;
