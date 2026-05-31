/** Opportunity metadata key set on canonical approve_enrollment when blank. */
export const OPPORTUNITY_ENROLLMENT_DATE_METADATA_KEY = "enrollment_date";

/** Status keys where approve_enrollment is surfaced in the drawer header Actions menu. */
export const ENROLLMENT_APPROVAL_ACTION_STATUS_KEYS = [
    "ready_to_enroll",
    "enrolling",
    "waitlisted",
    "follow_up_attempted",
    "tour_completed",
] as const;

export const APPROVE_ENROLLMENT_ACTION_KEY = "approve_enrollment";
export const ENROLLED_STATUS_KEY = "enrolled";
