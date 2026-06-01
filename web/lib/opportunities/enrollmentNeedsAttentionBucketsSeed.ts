/**
 * Childcare / enrollment **demo operating model** — Needs Attention bucket lenses only.
 *
 * **Not** platform defaults: apply via department (or work unit) metadata
 * `metadata.opportunity_attention_rules.needs_attention_buckets`, e.g. `ensureEnrollmentPipelineWorkUnitV1.ts`.
 * Resolver reason codes are platform-owned; visible buckets are config-owned.
 *
 * Lifecycle-aligned lenses (May 2026): quote-era buckets removed from default seed.
 */
export const CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED = [
    {
        key: "new_inquiry_stale",
        label: "New inquiry — first response overdue",
        description: "Lead stage — timely first contact",
        enabled: true,
        order: 10,
        priority: 10,
        icon: "user-plus",
        reason_codes: ["stale_new_inquiry"],
    },
    {
        key: "qualification_stale",
        label: "Qualification — follow-up overdue",
        description: "Qualification stage — idle after contact",
        enabled: true,
        order: 20,
        priority: 20,
        icon: "phone",
        reason_codes: ["stale_qualified"],
    },
    {
        key: "follow_up_overdue",
        label: "Follow-up commitment overdue",
        description: null,
        enabled: true,
        order: 30,
        priority: 30,
        icon: "alert-circle",
        reason_codes: ["follow_up_date_passed"],
    },
    {
        key: "tour_date_passed",
        label: "Tour — outcome needed",
        description: "Tour stage — scheduled date passed without outcome",
        enabled: true,
        order: 40,
        priority: 40,
        icon: "calendar-x",
        reason_codes: ["tour_date_passed"],
    },
    {
        key: "high_value_stale",
        label: "High-value — re-engage",
        description: "Mid/late funnel inactivity",
        enabled: true,
        order: 50,
        priority: 50,
        icon: "flame",
        reason_codes: ["high_value_stale"],
    },
    {
        key: "waiting_on_family",
        label: "Waiting on family",
        description: "Enrollment / waitlist — external wait",
        enabled: true,
        order: 60,
        priority: 60,
        icon: "clock-3",
        reason_codes: ["waiting_on_family"],
    },
    {
        key: "waiting_on_staff",
        label: "Waiting on staff",
        description: "Enrollment — internal action outstanding",
        enabled: true,
        order: 70,
        priority: 70,
        icon: "clipboard-list",
        reason_codes: ["waiting_on_staff"],
    },
    {
        key: "waiting_on_documents",
        label: "Waiting on documents",
        description: "Enrollment — paperwork pending",
        enabled: true,
        order: 80,
        priority: 80,
        icon: "file-text",
        reason_codes: ["waiting_on_documents"],
    },
] as const;
