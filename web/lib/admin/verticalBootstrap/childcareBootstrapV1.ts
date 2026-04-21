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
                id: "run_quote",
                description:
                    "Move to needs_a_quote, complete pricing, then quoted — lifecycle shows execution then decision.",
                phase: "execution",
                applies_to: "opportunity",
                deferred_to_product: false,
            },
            {
                id: "follow_up_priced",
                description:
                    "Priced follow-up queue surfaces quoted_not_booked work until enrolled or lost.",
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
            entity_type: "opportunity",
            status_key: "new",
            status_label: "New inquiry",
            sort_order: 10,
            is_active: true,
            metadata: { lifecycle_stage: "intake" },
        },
        {
            entity_type: "opportunity",
            status_key: "qualified",
            status_label: "Qualified",
            sort_order: 20,
            is_active: true,
            metadata: { lifecycle_stage: "qualification" },
        },
        {
            entity_type: "opportunity",
            status_key: "needs_a_quote",
            status_label: "Needs a quote",
            sort_order: 30,
            is_active: true,
            metadata: { lifecycle_stage: "execution" },
        },
        {
            entity_type: "opportunity",
            status_key: "quoted",
            status_label: "Offer sent",
            sort_order: 40,
            is_active: true,
            metadata: { lifecycle_stage: "decision" },
        },
        {
            entity_type: "opportunity",
            status_key: "booked",
            status_label: "Enrolled",
            sort_order: 50,
            is_active: true,
            metadata: { lifecycle_stage: "success" },
        },
        {
            entity_type: "opportunity",
            status_key: "lost",
            status_label: "Did not enroll",
            sort_order: 60,
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
            name: "New & qualifying",
            description: "Intake and fit — before quoting work.",
            sort_order: 10,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { status_keys: ["new", "qualified"] },
                sort: { by: "updated_at", direction: "desc" },
                limit: 80,
            },
        },
        {
            department_key: "enrollment",
            key: "quoting",
            name: "Quoting",
            description: "Active pricing and enrollment offers in progress.",
            sort_order: 20,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { status_keys: ["needs_a_quote"] },
                sort: { by: "updated_at", direction: "desc" },
                limit: 80,
            },
        },
        {
            department_key: "enrollment",
            key: "priced_followup",
            name: "Priced — follow up",
            description: "Offers sent; awaiting family decision.",
            sort_order: 30,
            is_active: true,
            queue_definition: {
                version: 1,
                entity_type: "opportunity",
                filters: { quote_state: "quoted_not_booked" },
                sort: { by: "updated_at", direction: "desc" },
                limit: 60,
            },
        },
    ],
};
