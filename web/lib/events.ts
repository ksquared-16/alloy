/**
 * Canonical event vocabulary for Alloy (Sprint 2).
 * Use for type-safe event_type and entity_type references. See docs/events.md.
 */

export const EVENT_TYPES = [
    "action_link_consumed",
    "booking_confirmed",
    /** Specialty cleaning intake; does not run standard `quote_started` workflows. */
    "specialty_quote_started",
    "quote_started",
    "schedule_created",
    "schedule_vendor_assigned",
    "job_default_vendor_applied",
    "job_action",
    "job_rescheduled",
    "job_canceled",
    "job_completed",
    "payment_succeeded",
    "payment_failed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const ENTITY_TYPES = [
    "job",
    "schedule",
    "customer",
    "contact",
    "vendor",
    "opportunity",
    "payment",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
