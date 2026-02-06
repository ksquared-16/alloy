/**
 * Single source of truth for workflow editor vocabulary (V1).
 */

export const WORKFLOW_ENTITY_TYPES = ["job", "opportunity", "contact", "customer", "schedule"] as const;
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

export const WORKFLOW_EVENT_TYPES = [
    "booking_confirmed",
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
        { value: "opportunity.id", label: "opportunity.id" },
        { value: "opportunity.job_date", label: "opportunity.job_date" },
        { value: "opportunity.job_time_window", label: "opportunity.job_time_window" },
        { value: "opportunity.pipeline_stage_id", label: "opportunity.pipeline_stage_id" },
    ],
    opportunity: [
        { value: "opportunity.id", label: "opportunity.id" },
        { value: "opportunity.name", label: "opportunity.name" },
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
};

/** Entity_id quick-fill options for update_entity (dot paths into event payload). */
export const WORKFLOW_ENTITY_ID_QUICK_FILL = [
    { value: "job.id", label: "job.id" },
    { value: "contact.id", label: "contact.id" },
    { value: "customer.id", label: "customer.id" },
    { value: "opportunity.id", label: "opportunity.id" },
    { value: "schedule.id", label: "schedule.id" },
] as const;
