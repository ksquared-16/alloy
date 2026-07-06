/**
 * Enrollment queue membership flags.
 *
 * Canonical child-participation membership is `process_instances` (effective stage). OCM
 * (opportunity_customer_members) is a LEGACY fallback for un-backfilled records only, used ONLY when
 * this flag is explicitly enabled. Default: OFF — OCM-only rows are not canonical.
 */
export function enrollmentQueueOcmFallbackEnabled(): boolean {
    return process.env.ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK === "1";
}
