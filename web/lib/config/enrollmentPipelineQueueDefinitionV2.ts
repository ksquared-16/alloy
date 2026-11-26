/**
 * Canonical Enrollment Pipeline queue_definition v2 (domain + grain metadata).
 * Execution behavior preserved via `filters_compat_v1` until grain-aware QueueService (Card 6).
 *
 * Stored on `work_units.queue_definition` where `key = enrollment_pipeline`.
 * Seeded by `supabase/migrations/20260601130000_enrollment_pipeline_queue_definition_v2.sql`.
 * UI labels simplified in Card 14A (`20260602100000_enrollment_pipeline_queue_definition_v2_14a.sql`).
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { expandEnrollmentNewLeadsQueueStatusKeys } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";

/** Raw v2 document — not strict Zod v1; validated through runtime bundle loader. */
export const RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 = {
    version: 2 as const,
    entity_type: "opportunity" as const,
    ui: {
        layout: "domain_with_attention" as const,
        primary_total_label: "Work Units",
        primary_total_queue: "pipeline_total",
        suppress_other_pill: true,
        suppress_lifecycle_panel: true,
        suppress_active_queue_description: true,
        sections: [
            { key: "new_leads", label: "New Leads", queue_keys: ["new_leads"] },
            { key: "tours", label: "Tours", queue_keys: ["tours"] },
            { key: "communications_followup", label: "Follow Up", queue_keys: ["communications_followup"] },
            { key: "waitlist", label: "Waitlist", queue_keys: ["waitlist"] },
            { key: "enrolling", label: "Enrolling", queue_keys: ["enrollment_offers"] },
            { key: "enrolled", label: "Enrolled", queue_keys: ["enrollment_completed"] },
            {
                key: "needs_attention",
                label: "Needs Attention",
                tone: "critical" as const,
                queue_keys: ["needs_attention"],
            },
        ],
        row_preview: {
            variant: "crm_compact" as const,
            fields: [
                "title",
                "status",
                "primary_contact",
                "phone",
                "email",
                "child_name",
                "program",
                "start_date",
                "tour_date",
            ],
            actions: ["open"],
        },
    },
    queues: [
        {
            key: "pipeline_total",
            label: "Pipeline total",
            description: "Total count for pipeline scope (internal KPI lane).",
            domain: "pipeline",
            grain: "case",
            filters: [],
            filters_compat_v1: [],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "new_leads",
            label: "New Leads",
            icon: "user-plus",
            description: "New families — first touch not yet completed.",
            domain: "new_leads",
            grain: "case",
            aliases: ["new_inquiry"],
            filters: [{ type: "case_status", operator: "in", values: ["new_inquiry", "open", "new"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["new_inquiry", "open", "new"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "communications_followup",
            label: "Follow Up",
            icon: "phone",
            description: "Qualification and follow-up — gathering fit before tour or waitlist.",
            domain: "communications_followup",
            grain: "case",
            aliases: ["contacted", "contact_attempted", "qualification"],
            filters: [
                {
                    type: "case_status",
                    operator: "in",
                    values: ["contact_attempted", "contacted", "qualification"],
                },
            ],
            filters_compat_v1: [
                {
                    type: "status",
                    operator: "in",
                    values: ["contact_attempted", "contacted", "qualification"],
                },
            ],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "tours",
            label: "Tours",
            icon: "calendar",
            description: "A tour is on the calendar.",
            domain: "tours",
            grain: "case",
            aliases: ["tour_scheduled"],
            filters: [{ type: "case_status", operator: "in", values: ["tour_scheduled"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["tour_scheduled"] }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "tours_follow_up",
            label: "Tours",
            icon: "clipboard-check",
            description: "Post-tour decision window — completed tour, follow-up attempts, or tour no-show.",
            domain: "tours",
            grain: "case",
            aliases: ["tour_completed_follow_up"],
            filters: [
                {
                    type: "case_status",
                    operator: "in",
                    values: ["tour_completed", "follow_up_attempted", "tour_no_show"],
                },
            ],
            filters_compat_v1: [
                {
                    type: "status",
                    operator: "in",
                    values: ["tour_completed", "follow_up_attempted", "tour_no_show"],
                },
            ],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "forms_documents",
            label: "Forms / Documents",
            domain: "forms_documents",
            grain: "case",
            filters: [],
            filters_compat_v1: [],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "waitlist",
            label: "Waitlist",
            icon: "clock-3",
            domain: "waitlist",
            grain: "candidate",
            count_unit: "children",
            aliases: ["waitlisted"],
            filters: [
                { type: "candidate_status", operator: "in", values: ["active", "paused"] },
                { type: "child_lifecycle_status", operator: "in", values: ["waitlisted", "offer_pending"] },
            ],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["waitlisted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "enrollment_offers",
            label: "Enrolling",
            icon: "file-text",
            description: "Paperwork or decision in motion toward a start date.",
            domain: "enrollment_offers",
            grain: "child",
            count_unit: "children",
            aliases: ["ready_to_enroll", "enrolling"],
            filters: [
                {
                    type: "child_lifecycle_status",
                    operator: "in",
                    values: ["offer_pending", "enrolling"],
                },
            ],
            filters_compat_v1: [
                { type: "status", operator: "in", values: ["enrolling", "ready_to_enroll"] },
            ],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "enrollment_completed",
            label: "Enrolled",
            icon: "check-circle-2",
            description: "Confirmed enrollment (child completion view).",
            domain: "enrollment_offers",
            grain: "child",
            count_unit: "children",
            aliases: ["enrolled"],
            filters: [{ type: "child_lifecycle_status", operator: "in", values: ["enrolled"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["enrolled"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "case_closed",
            label: "Lost",
            icon: "x-circle",
            description: "Closed — not enrolling.",
            domain: "archive",
            grain: "case",
            aliases: ["lost"],
            filters: [{ type: "case_status", operator: "in", values: ["closed", "lost"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["lost"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "needs_attention",
            label: "Needs attention",
            description: "Operational intervention overlay — not a separate lifecycle pipeline.",
            domain: "needs_attention",
            grain: "case",
            overlay: true,
            filters: [{ type: "exception", operator: "exists" }],
            filters_compat_v1: [{ type: "exception", operator: "exists" }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 50,
            priority: "critical",
            display: "list",
        },
    ],
} as const;

/** Validated load bundle — v1 execution def + normalized v2 metadata. */
export const ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE = loadQueueDefinitionBundle(
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2
);

/** Visible throughput domain section keys (Card 14A — excludes hidden forms_documents). */
export const ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_SECTION_KEYS = [
    "new_leads",
    "tours",
    "communications_followup",
    "waitlist",
    "enrolling",
    "enrolled",
] as const;

/** Visible throughput pill labels in UI order. */
export const ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_LABELS = [
    "New Leads",
    "Tours",
    "Follow Up",
    "Waitlist",
    "Enrolling",
    "Enrolled",
] as const;

/** All domain keys with execution queues (includes hidden forms_documents). */
export const ENROLLMENT_PIPELINE_V2_DOMAIN_KEYS = [
    "new_leads",
    "tours",
    "communications_followup",
    "forms_documents",
    "waitlist",
    "enrollment_offers",
    "needs_attention",
] as const;

/** Legacy queue key → canonical v2 queue key (alias registry for verification). */
export const ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES: Record<string, string> = {
    new_inquiry: "new_leads",
    contacted: "communications_followup",
    contact_attempted: "communications_followup",
    tour_scheduled: "tours",
    tour_completed_follow_up: "tours_follow_up",
    waitlisted: "waitlist",
    ready_to_enroll: "enrollment_offers",
    enrolling: "enrollment_offers",
    enrolled: "enrollment_completed",
    lost: "case_closed",
};

/** Status keys that place an opportunity in the enrollment pipeline New Leads queue. */
export function enrollmentPipelineNewLeadsStatusKeys(
    raw: unknown = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2
): string[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return expandEnrollmentNewLeadsQueueStatusKeys(["new_inquiry"]);
    }
    const queues = (raw as {
        queues?: Array<{
            key?: string;
            filters?: Array<{ type?: string; values?: unknown[] }>;
            filters_compat_v1?: Array<{ values?: unknown[] }>;
        }>;
    }).queues;
    const entry = queues?.find((q) => q.key === "new_leads");
    const keys = new Set<string>();
    for (const source of [entry?.filters_compat_v1?.[0], entry?.filters?.find((f) => f.type === "case_status")]) {
        const values = Array.isArray(source?.values) ? source.values : [];
        for (const v of values) {
            if (typeof v === "string" && v.trim()) keys.add(v.trim().toLowerCase());
        }
    }
    const base = keys.size > 0 ? [...keys] : ["new_inquiry"];
    return expandEnrollmentNewLeadsQueueStatusKeys(base);
}

/** Whether an opportunity status_key should appear in enrollment New Leads. */
export function opportunityMatchesEnrollmentNewLeadsQueue(statusKey: string | null | undefined): boolean {
    const sk = typeof statusKey === "string" ? statusKey.trim().toLowerCase() : "";
    if (!sk) return false;
    return enrollmentPipelineNewLeadsStatusKeys().some((v) => v.toLowerCase() === sk);
}

/** Throughput section labels from config (excludes needs_attention). */
export function enrollmentPipelineVisibleThroughputLabels(
    raw: unknown = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2
): string[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const ui = (raw as { ui?: { sections?: Array<{ label?: string; tone?: string }> } }).ui;
    const sections = ui?.sections ?? [];
    return sections
        .filter((s) => s.tone !== "critical")
        .map((s) => String(s.label ?? "").trim())
        .filter(Boolean);
}
