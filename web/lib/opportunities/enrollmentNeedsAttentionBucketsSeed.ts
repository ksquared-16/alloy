/**
 * Childcare / enrollment **demo operating model** — Needs Attention bucket lenses only.
 *
 * **Not** platform defaults: apply via department (or work unit) metadata
 * `metadata.opportunity_attention_rules.needs_attention_buckets`, e.g. `ensureEnrollmentPipelineWorkUnitV1.ts`.
 * Resolver reason codes are platform-owned; visible buckets are config-owned.
 */
export const CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED = [
    {
        key: "follow_up_overdue",
        label: "Follow-up overdue",
        description: null,
        enabled: true,
        order: 10,
        priority: 10,
        icon: "alert-circle",
        reason_codes: ["follow_up_date_passed"],
    },
    {
        key: "high_value_stale",
        label: "High-value stale > 2 days",
        description: null,
        enabled: true,
        order: 20,
        priority: 20,
        icon: "flame",
        reason_codes: ["high_value_stale"],
    },
    {
        key: "quote_follow_up_overdue",
        label: "Quote follow-up overdue",
        description: null,
        enabled: true,
        order: 30,
        priority: 30,
        icon: "receipt-text",
        reason_codes: ["stale_quote_followup"],
    },
    {
        key: "tour_date_passed",
        label: "Tour date passed — follow up",
        description: null,
        enabled: true,
        order: 40,
        priority: 40,
        icon: "calendar-x",
        reason_codes: ["tour_date_passed"],
    },
] as const;
