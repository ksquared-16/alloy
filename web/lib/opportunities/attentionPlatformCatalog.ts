/**
 * Platform-owned attention taxonomy + defaults (GATE 3).
 * Tenant tuning extends via {@link resolveOpportunityAttentionConfigFromMetadata} — not arbitrary logic.
 */

import type { OpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";

/** Lifecycle reasons from opportunityAttentionRules.ts */
export type AttentionLifecycleReason = OpportunityAttentionReason;

/** Queue lane + V2 operational codes (stable snake_case). */
export type AttentionOperationalReasonCode =
    | "follow_up_date_passed"
    | "tour_date_passed"
    | "high_value_stale"
    | "mid_funnel_stale"
    | "missing_identity"
    | "missing_required_info"
    | "overdue_commitment"
    | "blocked_internal"
    | "waiting_on_staff"
    | "waiting_on_family"
    | "waiting_on_documents"
    | "waiting_on_payment"
    | "blocked_external"
    | "stage_work_overdue"
    | "stage_age_exceeded"
    | "stage_missing_required_fields"
    | "stage_attempts_incomplete";

/** All canonical attention reason codes (platform-owned). */
export type OpportunityAttentionReasonCode = AttentionLifecycleReason | AttentionOperationalReasonCode;

/**
 * Default primary-reason ordering (GATE 2 approval).
 * Lower index = wins primary_reason when multiple triggers fire.
 */
export const PLATFORM_PRIMARY_REASON_PRIORITY_ORDER: readonly OpportunityAttentionReasonCode[] = [
    "blocked_internal",
    "waiting_on_staff",
    "stage_missing_required_fields",
    "stage_work_overdue",
    "stage_attempts_incomplete",
    "missing_identity",
    "missing_required_info",
    "stage_age_exceeded",
    "overdue_commitment",
    "tour_date_passed",
    "follow_up_date_passed",
    "missing_quote_after_execution",
    "stale_quote_followup",
    "waiting_on_family",
    "waiting_on_documents",
    "waiting_on_payment",
    "blocked_external",
    "high_value_stale",
    "mid_funnel_stale",
    "stale_qualified",
    "stale_new_inquiry",
] as const;

/** Default resolver severities when policy omits explicit severity. */
export const DEFAULT_SEVERITY_BY_REASON: Readonly<Record<OpportunityAttentionReasonCode, "critical" | "high" | "medium" | "low">> =
    {
        blocked_internal: "high",
        waiting_on_staff: "high",
        missing_identity: "high",
        missing_required_info: "high",
        stage_work_overdue: "high",
        stage_age_exceeded: "medium",
        stage_missing_required_fields: "high",
        stage_attempts_incomplete: "high",
        overdue_commitment: "high",
        tour_date_passed: "high",
        follow_up_date_passed: "high",
        missing_quote_after_execution: "medium",
        stale_quote_followup: "medium",
        waiting_on_family: "medium",
        waiting_on_documents: "medium",
        waiting_on_payment: "high",
        blocked_external: "medium",
        high_value_stale: "medium",
        mid_funnel_stale: "medium",
        stale_qualified: "medium",
        stale_new_inquiry: "medium",
    };

/** Wait buckets stored under metadata.enrollment_operational.wait_bucket */
export const ENROLLMENT_WAIT_BUCKETS = [
    "none",
    "waiting_on_family",
    "waiting_on_staff",
    "waiting_on_documents",
    "waiting_on_payment",
    "blocked_internal",
    "blocked_external",
] as const;

export type EnrollmentWaitBucket = (typeof ENROLLMENT_WAIT_BUCKETS)[number];

export type WaitBucketSlaHours = {
    /** Hours until “approaching” SLA tier (foundation: calendar-hour placeholders). */
    warning_hours: number;
    /** Hours until “breached” SLA tier. */
    critical_hours: number;
};

/**
 * Foundation SLA defaults (GATE 3 placeholders — config-tunable).
 * Uses calendar hours (~business-day intent documented in execution docs).
 */
export const DEFAULT_WAIT_BUCKET_SLA_HOURS: Readonly<Record<Exclude<EnrollmentWaitBucket, "none">, WaitBucketSlaHours>> = {
    waiting_on_staff: { warning_hours: 24, critical_hours: 48 },
    blocked_internal: { warning_hours: 0, critical_hours: 24 },
    waiting_on_family: { warning_hours: 72, critical_hours: 168 },
    waiting_on_documents: { warning_hours: 72, critical_hours: 168 },
    waiting_on_payment: { warning_hours: 48, critical_hours: 120 },
    blocked_external: { warning_hours: 120, critical_hours: 240 },
};

export function isEnrollmentWaitBucket(raw: string): raw is EnrollmentWaitBucket {
    return (ENROLLMENT_WAIT_BUCKETS as readonly string[]).includes(raw);
}

export function waitBucketToAttentionReasonCode(bucket: Exclude<EnrollmentWaitBucket, "none">): OpportunityAttentionReasonCode {
    return bucket;
}

export function isOpportunityAttentionReasonCode(raw: string): raw is OpportunityAttentionReasonCode {
    return Object.prototype.hasOwnProperty.call(DEFAULT_SEVERITY_BY_REASON, raw);
}

/** Canonical resolver reason codes for Settings pickers (sorted, platform-owned). */
export const CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED: readonly OpportunityAttentionReasonCode[] = (
    Object.keys(DEFAULT_SEVERITY_BY_REASON) as OpportunityAttentionReasonCode[]
).slice().sort((a, b) => a.localeCompare(b));
