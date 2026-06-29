/**
 * Operational Consumption — code-owned vocabularies + row/DTO shapes (Slice 1).
 *
 * Mirror of:
 *   supabase/migrations/20260706120000_operational_consumption_foundation.sql
 *
 * Operational Consumption is the RUNTIME layer between Operational Execution and
 * Commercial / Financial Resolution. It interprets an operational fact into a
 * Consumption Event and zero-or-more Resolved Obligations. It posts nothing —
 * Posting is the only authoritative money write (out of scope).
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

/** A Consumption Event's runtime status. */
export const CONSUMPTION_EVENT_STATUSES = ["recorded", "resolved", "no_obligation", "superseded"] as const;
export type ConsumptionEventStatus = (typeof CONSUMPTION_EVENT_STATUSES)[number];

/** A Resolved Obligation's draft lifecycle status (never authoritative). */
export const RESOLVED_OBLIGATION_STATUSES = ["previewed", "drafted", "no_charge", "superseded"] as const;
export type ResolvedObligationStatus = (typeof RESOLVED_OBLIGATION_STATUSES)[number];

/** Registry row: which operational facts carry commercial meaning. */
export type ConsumptionEventTypeRow = {
    id: string;
    org_id: string | null;
    event_key: string;
    label: string;
    source_family: string;
    description: string | null;
    /** Commercial Model Charge Template key this event resolves; null => no charge. */
    charge_template_key: string | null;
    default_responsibility_key: string | null;
    is_active: boolean;
    effective_start: string;
    effective_end: string | null;
    metadata: Record<string, unknown>;
};

/**
 * A normalized operational fact handed to the consumption layer. The canonical
 * runtime contract — NOT a charge. Source-family-shaped fields are optional so
 * the same DTO carries enrollment, attendance, schedule, etc. facts later.
 */
export type OperationalFactDto = {
    sourceFamily: string;
    eventKey: string;
    sourceEntityType: string;
    sourceEntityId: string;
    subjectType?: string | null;
    subjectId?: string | null;
    locationId?: string | null;
    /** Date the fact occurs (YYYY-MM-DD). Defaults to `today` when omitted. */
    occursOn?: string | null;
    effectiveOn?: string | null;
    context?: Record<string, unknown> | null;
    /** Stable idempotency key; derived from the fact when omitted. */
    idempotencyKey?: string | null;
    // Pass-through inputs consumed by the Commercial Model Charge Template resolver:
    eventDate?: string | null;
    servicePeriodStart?: string | null;
    quantity?: number | null;
    unitAmountCents?: number | null;
};

/** The Consumption Event a fact resolves into (preview shape; persisted in draft mode). */
export type ConsumptionEventIntent = {
    eventTypeId: string | null;
    sourceFamily: string;
    eventKey: string;
    sourceEntityType: string;
    sourceEntityId: string;
    subjectType: string | null;
    subjectId: string | null;
    locationId: string | null;
    occursOn: string;
    effectiveOn: string | null;
    status: ConsumptionEventStatus;
    context: Record<string, unknown>;
    idempotencyKey: string;
};

/** A draft obligation the consumption event resolves to (preview shape). */
export type ResolvedObligationIntent = {
    chargeTemplateId: string | null;
    serviceId: string | null;
    amountCents: number | null;
    currencyCode: string;
    responsibilityKey: string | null;
    occursOn: string | null;
    billableOn: string | null;
    reviewRequired: boolean;
    status: ResolvedObligationStatus;
    resolutionKey: string | null;
    explanation: Record<string, unknown>;
};

/** Persisted-row shapes (for service-layer reads/writes and tests). */
export type ConsumptionEventRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    event_type_id: string | null;
    source_family: string;
    event_key: string;
    source_entity_type: string;
    source_entity_id: string;
    subject_type: string | null;
    subject_id: string | null;
    occurs_on: string;
    effective_on: string | null;
    status: ConsumptionEventStatus;
    context: Record<string, unknown> | null;
    idempotency_key: string;
};

export type ResolvedObligationRow = {
    id: string;
    org_id: string;
    consumption_event_id: string;
    charge_template_id: string | null;
    service_id: string | null;
    amount_cents: number | null;
    currency_code: string;
    responsibility_key: string | null;
    occurs_on: string | null;
    billable_on: string | null;
    status: ResolvedObligationStatus;
    review_required: boolean;
    explanation: Record<string, unknown> | null;
    draft_charge_id: string | null;
    resolution_key: string | null;
};
