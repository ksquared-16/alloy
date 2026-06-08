import type { VerticalBootstrapPayloadV1 } from "@/lib/admin/verticalBootstrap/types";

/**
 * Childcare vertical — first rehearsal of future org onboarding: same JSON contract the config agent
 * will generate; apply persists departments, statuses (lifecycle), work units + queues only.
 *
 * Terminology, actions, and field-intake expectations live in `onboarding_context` (preview echoes;
 * apply ignores until those surfaces persist them).
 */
export const CHILDCARE_VERTICAL_BOOTSTRAP_V1: VerticalBootstrapPayloadV1 = {
    schema_version: 1,
    vertical_key: "childcare",
    onboarding_context: {
        industry_key: "childcare",
        industry_label: "Childcare & early learning",
        terminology: {
            opportunity: "Family inquiry",
            opportunities_queue: "Inquiries",
            customer: "Family",
            primary_contact: "Parent or guardian",
            quote: "Enrollment offer",
            booked: "Enrolled",
        },
        action_expectations: [
            {
                id: "capture_inquiry",
                description:
                    "Staff captures a new family inquiry; opportunity lands in intake/qualification statuses.",
                phase: "intake",
                applies_to: "opportunity",
                deferred_to_product: false,
            },
            {
                id: "progress_inquiry",
                description:
                    "Progress the inquiry through conversation and tours, then move to ready-to-enroll / waitlist.",
                phase: "qualification",
                applies_to: "opportunity",
                deferred_to_product: false,
            },
            {
                id: "follow_up_ready",
                description:
                    "Follow up on ready-to-enroll and waitlist cases until enrolled or lost.",
                phase: "decision",
                applies_to: "opportunity",
                deferred_to_product: false,
            },
            {
                id: "register_quote_intake",
                description:
                    "Wire book-v2 / quote-intake fields to org-specific field_definitions (deferred; not in bootstrap apply).",
                phase: "execution",
                applies_to: "opportunity",
                deferred_to_product: true,
            },
            {
                id: "workspace_layouts",
                description:
                    "Bind department/workspace layouts and record actions after structure exists (deferred).",
                phase: "ongoing",
                applies_to: "workspace",
                deferred_to_product: true,
            },
        ],
        starter_field_intake: {
            registration: "deferred",
            notes:
                "Quote flows still require catalog registration for org-specific fields; list below is the intended minimum for childcare quoting.",
            suggested_inputs_for_quote: [
                "child_age_or_grade",
                "schedule_type",
                "start_date_desired",
                "subsidy_or_voucher",
            ],
        },
    },
    departments: [
        {
            key: "enrollment",
            name: "Enrollment",
            description: "Family inquiries, tours, quotes, and enrollment decisions.",
            sort_order: 10,
            is_active: true,
            metadata: {
                onboarding_lane: "primary",
                audience: "families",
            },
        },
    ],
    status_definitions: [
        {
            entity_type: "opportunities",
            status_key: "new_inquiry",
            status_label: "New inquiry",
            sort_order: 10,
            is_active: true,
            metadata: { lifecycle_stage: "intake" },
        },
        {
            entity_type: "opportunities",
            status_key: "contacted",
            status_label: "Conversation had",
            sort_order: 20,
            is_active: true,
            metadata: { lifecycle_stage: "qualification" },
        },
        {
            entity_type: "opportunities",
            status_key: "tour_scheduled",
            status_label: "Tour scheduled",
            sort_order: 30,
            is_active: true,
            metadata: { lifecycle_stage: "execution" },
        },
        {
            entity_type: "opportunities",
            status_key: "tour_completed",
            status_label: "Tour completed",
            sort_order: 40,
            is_active: true,
            metadata: { lifecycle_stage: "execution" },
        },
        {
            entity_type: "opportunities",
            status_key: "ready_to_enroll",
            status_label: "Ready to enroll",
            sort_order: 50,
            is_active: true,
            metadata: { lifecycle_stage: "decision" },
        },
        {
            entity_type: "opportunities",
            status_key: "waitlisted",
            status_label: "Waitlisted",
            sort_order: 55,
            is_active: true,
            metadata: { lifecycle_stage: "decision" },
        },
        {
            entity_type: "opportunities",
            status_key: "enrolled",
            status_label: "Enrolled",
            sort_order: 60,
            is_active: true,
            metadata: { lifecycle_stage: "success" },
        },
        {
            entity_type: "opportunities",
            status_key: "lost",
            status_label: "Lost",
            sort_order: 70,
            is_active: true,
            metadata: { lifecycle_stage: "failure" },
        },
    ],
    work_units: [
        {
            department_key: "enrollment",
            key: "pipeline_overview",
            name: "All inquiries",
            description: "Full opportunity pipeline for enrollment staff.",
            sort_order: 0,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                sort: { by: "updated_at", direction: "desc" },
                limit: 150,
            },
            metadata: { role: "overview" },
        },
        {
            department_key: "enrollment",
            key: "early_inquiries",
            name: "New & contacted",
            description: "New inquiries and early conversations.",
            sort_order: 10,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { status_keys: ["new_inquiry", "contacted"] },
                sort: { by: "updated_at", direction: "desc" },
                limit: 80,
            },
        },
        {
            department_key: "enrollment",
            key: "quoting",
            name: "Tours in progress",
            description: "Tours scheduled or completed.",
            sort_order: 20,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { status_keys: ["tour_scheduled", "tour_completed"] },
                sort: { by: "updated_at", direction: "desc" },
                limit: 80,
            },
        },
        {
            department_key: "enrollment",
            key: "priced_followup",
            name: "Ready / waitlist",
            description: "Ready-to-enroll and waitlisted inquiries.",
            sort_order: 30,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { status_keys: ["ready_to_enroll", "waitlisted"] },
                sort: { by: "updated_at", direction: "desc" },
                limit: 60,
            },
        },
        {
            department_key: "enrollment",
            key: "needs_attention",
            name: "Needs attention",
            description: "Inquiries that are stale or blocked and need an intervention.",
            sort_order: 40,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                sort: { by: "updated_at", direction: "asc" },
                limit: 200,
            },
            metadata: {
                role: "needs_attention",
                opportunity_attention_rules: {
                    version: 1,
                    thresholdsHours: {
                        stale_new_inquiry: 48,
                        stale_qualified: 72,
                        stale_quote_followup: 72,
                        missing_quote_after_execution: 72,
                    },
                },
            },
        },
    ],
};
