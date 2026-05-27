/**
 * Canonical Enrollment Pipeline queue_definition v2 (domain + grain metadata).
 * Execution behavior preserved via `filters_compat_v1` until grain-aware QueueService (Card 6).
 *
 * Stored on `work_units.queue_definition` where `key = enrollment_pipeline`.
 * Seeded by `supabase/migrations/20260601130000_enrollment_pipeline_queue_definition_v2.sql`.
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";

/** Raw v2 document — not strict Zod v1; validated through runtime bundle loader. */
export const RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 = {
    version: 2 as const,
    entity_type: "opportunity" as const,
    ui: {
        layout: "domain_with_attention" as const,
        primary_total_label: "Pipeline families",
        primary_total_queue: "pipeline_total",
        sections: [
            { key: "new_leads", label: "New Leads", queue_keys: ["new_leads"] },
            {
                key: "tours",
                label: "Tours",
                queue_keys: ["tours", "tours_follow_up"],
            },
            {
                key: "communications_followup",
                label: "Communications / Follow-up",
                queue_keys: ["communications_followup"],
            },
            {
                key: "forms_documents",
                label: "Forms / Documents",
                queue_keys: ["forms_documents"],
            },
            { key: "waitlist", label: "Waitlist", queue_keys: ["waitlist"] },
            {
                key: "enrollment_offers",
                label: "Enrollment / Offers",
                queue_keys: ["enrollment_offers", "enrollment_completed"],
            },
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
                "desired_start_date",
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
            filters: [{ type: "case_status", operator: "in", values: ["new_inquiry", "open"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["new_inquiry"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "communications_followup",
            label: "Communications / Follow-up",
            icon: "phone",
            description: "Staff has attempted contact; conversation may be in progress.",
            domain: "communications_followup",
            grain: "case",
            aliases: ["contacted", "contact_attempted"],
            filters: [
                { type: "case_status", operator: "in", values: ["contact_attempted", "contacted"] },
            ],
            filters_compat_v1: [
                { type: "status", operator: "in", values: ["contact_attempted", "contacted"] },
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
            label: "Tour Completed / Follow-up",
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
            label: "Enrollment / Offers",
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
            label: "Enrolled children",
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

/** Expected domain keys in v2 ui.sections (excluding internal pipeline_total). */
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
