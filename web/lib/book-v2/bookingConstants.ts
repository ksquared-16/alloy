/**
 * Configured pipeline/status IDs from Alloy DB (do not duplicate or guess in code).
 */
export const BOOKED_PIPELINE_STAGE_ID = "eec3530b-fad5-4a76-966c-97cec131de18";

/** Last-resort job_statuses.id if resolveBookingJobStatus finds no row (matches `scheduled` in typical seed — avoid in_progress for new bookings). */
export const BOOKING_CONFIRM_JOB_STATUS_ID = "b76b9406-765d-4366-a5d0-746d5212f605";
/** Canonical key for a newly confirmed booking (awaiting vendor assignment). */
export const BOOKING_CONFIRM_JOB_STATUS_KEY = "pending_assignment";
/**
 * Resolve order: prefer pending_assignment, then ready_for_assignment (common org naming), then scheduled.
 * Confirm uses resolveBookingJobStatus(orgId, this list).
 */
export const BOOKING_CONFIRM_JOB_STATUS_RESOLVE_KEYS: readonly string[] = [
    "pending_assignment",
    "ready_for_assignment",
    "scheduled",
];

/** Initial schedule row after booking confirm */
export const BOOKING_CONFIRM_SCHEDULE_STATUS_ID = "0c6014d1-134a-4280-b722-363d8624a992";
export const BOOKING_CONFIRM_SCHEDULE_STATUS_KEY = "scheduled";

export const BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY = "booked";
