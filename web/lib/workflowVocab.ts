/**
 * Single source of truth for workflow editor vocabulary (V1).
 * Canonical entity types: customer, contact, job, schedule, opportunity, vendor, location.
 */

export const WORKFLOW_ENTITY_TYPES = ["customer", "contact", "job", "schedule", "opportunity", "vendor", "location"] as const;
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

export const WORKFLOW_EVENT_TYPES = [
    "booking_confirmed",
    "specialty_quote_started",
    "quote_started",
    "job_action",
    "job_default_vendor_applied",
    "schedule_created",
    "schedule_vendor_assigned",
    "action_link_consumed",
    "job_rescheduled",
    "job_canceled",
    "job_completed",
    "payment_succeeded",
    "payment_failed",
] as const;
export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];


/** Field paths for conditions dropdown, keyed by entity_type. Value is path string, label for display. */
export const WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE: Record<string, { value: string; label: string }[]> = {
    job: [
        { value: "job.id", label: "job.id" },
        { value: "job.title", label: "job.title" },
        { value: "job.scheduled_at", label: "job.scheduled_at" },
        { value: "job.service_frequency_key", label: "job.service_frequency_key" },
        { value: "job.postal_code", label: "job.postal_code" },
        { value: "job.is_recurring", label: "job.is_recurring" },
        { value: "schedule.id", label: "schedule.id" },
        { value: "schedule.start_at", label: "schedule.start_at" },
        { value: "schedule.end_at", label: "schedule.end_at" },
        { value: "schedule.timezone", label: "schedule.timezone" },
        { value: "schedule.duration_minutes", label: "schedule.duration_minutes" },
        { value: "contact.id", label: "contact.id" },
        { value: "contact.first_name", label: "contact.first_name" },
        { value: "contact.last_name", label: "contact.last_name" },
        { value: "contact.email", label: "contact.email" },
        { value: "contact.phone", label: "contact.phone" },
        { value: "customer.id", label: "customer.id" },
        { value: "customer.name", label: "customer.name" },
        { value: "customer.postal_code", label: "customer.postal_code" },
        { value: "opportunity.id", label: "opportunity.id" },
        { value: "opportunity.postal_code", label: "opportunity.postal_code" },
        { value: "opportunity.job_date", label: "opportunity.job_date" },
        { value: "opportunity.job_time_window", label: "opportunity.job_time_window" },
        { value: "opportunity.pipeline_stage_id", label: "opportunity.pipeline_stage_id" },
        { value: "location.beds", label: "location.beds" },
        { value: "location.baths", label: "location.baths" },
        { value: "location.home_type_key", label: "location.home_type_key" },
        { value: "location.access_method_key", label: "location.access_method_key" },
        { value: "location.square_footage_tier_key", label: "location.square_footage_tier_key" },
        { value: "location.square_footage_tier_label", label: "location.square_footage_tier_label (human-readable tier)" },
        { value: "location.postal_code", label: "location.postal_code" },
        { value: "formatted_start_at", label: "formatted_start_at (booking_confirmed SMS)" },
        { value: "booking_price", label: "booking_price (USD string)" },
        { value: "booking_vendor_payout", label: "booking_vendor_payout (vendor-offer SMS; USD string)" },
        {
            value: "booking_pay_and_vendor_payout",
            label: "booking_pay_and_vendor_payout (Pay: price + payout; vendor-offer SMS)",
        },
        { value: "booking_bedrooms", label: "booking_bedrooms (legacy → resolves location.beds)" },
        { value: "booking_bathrooms", label: "booking_bathrooms (legacy → resolves location.baths)" },
        { value: "booking_square_footage", label: "booking_square_footage (legacy → tier key / location.square_footage_tier_key)" },
    ],
    opportunity: [
        { value: "opportunity.id", label: "opportunity.id" },
        { value: "opportunity.name", label: "opportunity.name" },
        { value: "opportunity.postal_code", label: "opportunity.postal_code" },
        { value: "opportunity.job_date", label: "opportunity.job_date" },
        { value: "opportunity.job_time_window", label: "opportunity.job_time_window" },
        { value: "contact.id", label: "contact.id" },
        { value: "contact.first_name", label: "contact.first_name" },
        { value: "contact.email", label: "contact.email" },
        { value: "customer.id", label: "customer.id" },
        { value: "customer.name", label: "customer.name" },
    ],
    contact: [
        { value: "contact.id", label: "contact.id" },
        { value: "contact.first_name", label: "contact.first_name" },
        { value: "contact.last_name", label: "contact.last_name" },
        { value: "contact.email", label: "contact.email" },
        { value: "contact.phone", label: "contact.phone" },
        { value: "customer.id", label: "customer.id" },
        { value: "customer.name", label: "customer.name" },
    ],
    customer: [
        { value: "customer.id", label: "customer.id" },
        { value: "customer.name", label: "customer.name" },
        { value: "customer.postal_code", label: "customer.postal_code" },
    ],
    schedule: [
        { value: "schedule.id", label: "schedule.id" },
        { value: "schedule.start_at", label: "schedule.start_at" },
        { value: "schedule.end_at", label: "schedule.end_at" },
        { value: "schedule.timezone", label: "schedule.timezone" },
        { value: "schedule.duration_minutes", label: "schedule.duration_minutes" },
        { value: "job.id", label: "job.id" },
        { value: "job.title", label: "job.title" },
    ],
    vendor: [
        { value: "vendor.id", label: "vendor.id" },
        { value: "vendor.name", label: "vendor.name" },
        { value: "vendor.email", label: "vendor.email" },
        { value: "vendor.phone", label: "vendor.phone" },
        { value: "vendor.vendor_status_id", label: "vendor.vendor_status_id" },
        { value: "vendor.primary_contact_id", label: "vendor.primary_contact_id" },
    ],
    location: [
        { value: "location.id", label: "location.id" },
        { value: "location.postal_code", label: "location.postal_code" },
        { value: "location.beds", label: "location.beds" },
        { value: "location.baths", label: "location.baths" },
        { value: "location.home_type_key", label: "location.home_type_key" },
        { value: "location.access_method_key", label: "location.access_method_key" },
        { value: "location.square_footage_tier_key", label: "location.square_footage_tier_key" },
        { value: "location.city", label: "location.city" },
        { value: "location.state", label: "location.state" },
    ],
};

/** Condition operators (DB and UI). eq/equals and neq/not_equals both supported at runtime. */
export const WORKFLOW_CONDITION_OPERATORS = ["eq", "neq", "contains", "gt", "lt", "gte", "lte", "in", "not_in", "is_null", "not_null", "exists"] as const;

/** Entity_id quick-fill options for update_entity (dot paths into event payload). */
export const WORKFLOW_ENTITY_ID_QUICK_FILL = [
    { value: "job.id", label: "job.id" },
    { value: "contact.id", label: "contact.id" },
    { value: "customer.id", label: "customer.id" },
    { value: "opportunity.id", label: "opportunity.id" },
    { value: "schedule.id", label: "schedule.id" },
    { value: "vendor.id", label: "vendor.id" },
    { value: "location.id", label: "location.id" },
] as const;
