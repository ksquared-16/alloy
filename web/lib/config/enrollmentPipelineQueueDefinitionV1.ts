import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";

/**
 * Opportunity status keys used by the canonical Enrollment Pipeline queue buckets.
 * Aligned with enrollment org status seeds (`supabase/migrations/20260430232500_*.sql`).
 */
export const CANONICAL_ENROLLMENT_PIPELINE_STATUS_KEYS = [
    "new_inquiry",
    "contact_attempted",
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
    "enrolled",
    "lost",
] as const;

const RAW_CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 = {
    version: 1 as const,
    entity_type: "opportunity" as const,
    ui: {
        layout: "pipeline_with_attention",
        primary_total_label: "Pipeline families",
        primary_total_queue: "pipeline_total",
        sections: [
            {
                key: "pipeline",
                label: "Pipeline",
                queue_keys: [
                    "new_inquiry",
                    "contact_attempted",
                    "tour_scheduled",
                    "tour_completed_follow_up",
                    "enrolling",
                    "waitlisted",
                    "enrolled",
                    "lost",
                ],
            },
            {
                key: "attention",
                label: "Needs Attention",
                tone: "critical",
                queue_keys: ["needs_attention"],
            },
        ],
        row_preview: {
            variant: "crm_compact",
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
            actions: ["open", "call", "email"],
        },
    },
    queues: [
        {
            key: "pipeline_total",
            label: "Pipeline total",
            description: "Total count for pipeline scope (internal KPI lane).",
            filters: [],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "new_inquiry",
            label: "New Inquiry",
            icon: "user-plus",
            description: "New families — first touch not yet completed.",
            filters: [{ type: "status", operator: "in", values: ["new_inquiry"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "contact_attempted",
            label: "Contact Attempted",
            icon: "phone",
            description: "Staff has attempted contact; conversation may be in progress.",
            filters: [{ type: "status", operator: "in", values: ["contact_attempted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "tour_scheduled",
            label: "Tour Scheduled",
            icon: "calendar",
            description: "A tour is on the calendar.",
            filters: [{ type: "status", operator: "in", values: ["tour_scheduled"] }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "tour_completed_follow_up",
            label: "Tour Completed / Follow-up",
            icon: "clipboard-check",
            description:
                "Post-tour decision window — completed tour, follow-up attempts, or tour no-show (execution states grouped for ops).",
            filters: [
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
            key: "enrolling",
            label: "Enrolling",
            icon: "file-text",
            description: "Paperwork or decision in motion toward a start date.",
            filters: [{ type: "status", operator: "in", values: ["enrolling"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "waitlisted",
            label: "Waitlisted",
            icon: "clock-3",
            filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "enrolled",
            label: "Enrolled",
            icon: "check-circle-2",
            description: "Confirmed enrollment.",
            filters: [{ type: "status", operator: "in", values: ["enrolled"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "lost",
            label: "Lost",
            icon: "x-circle",
            description: "Closed — not enrolling.",
            filters: [{ type: "status", operator: "in", values: ["lost"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
            limit: 50,
            priority: "standard",
            display: "list",
        },
        {
            key: "needs_attention",
            label: "Needs attention",
            description:
                "Operational intervention overlay — same records as pipeline, filtered by resolver attention (not a separate lifecycle pipeline).",
            filters: [{ type: "exception", operator: "exists" }],
            sort: [{ field: "updated_at", direction: "asc" }],
            limit: 50,
            priority: "critical",
            display: "list",
        },
    ],
} as const;

/** Validated canonical queue definition for work unit key `enrollment_pipeline`. */
export const CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1: QueueDefinitionV1 = validateQueueDefinition(
    RAW_CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1
);
