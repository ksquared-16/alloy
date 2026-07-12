/**
 * Operational Consumption — code-owned vocabularies + row/DTO shapes (Slice 1).
 *
 * Mirror of:
 *   supabase/migrations/20260706120050_operational_consumption_foundation.sql
 *
 * Operational Consumption is the RUNTIME layer between Operational Execution and
 * Commercial / Financial Resolution. It interprets an operational fact into a
 * Consumption Event and zero-or-more Resolved Obligations. It posts nothing —
 * Posting is the only authoritative money write (out of scope).
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

import type { OperationalFactEntryType } from "@/lib/operationalFacts/factContract";

export type { OperationalFactEntryType } from "@/lib/operationalFacts/factContract";

/** A Consumption Event's runtime status. */
export const CONSUMPTION_EVENT_STATUSES = ["recorded", "resolved", "no_obligation", "superseded"] as const;
export type ConsumptionEventStatus = (typeof CONSUMPTION_EVENT_STATUSES)[number];

/** A Resolved Obligation's draft lifecycle status (never authoritative). */
export const RESOLVED_OBLIGATION_STATUSES = ["previewed", "drafted", "no_charge", "superseded"] as const;
export type ResolvedObligationStatus = (typeof RESOLVED_OBLIGATION_STATUSES)[number];

/** What an obligation IS (drives explanation; pricing/timing still come from the Commercial Model). */
export const OBLIGATION_KINDS = [
    "registration",
    "recurring_tuition",
    "proration",
    "proration_credit",
    "drop_in",
    "extra_day",
    // Slice 3 — attendance consumption
    "late_pickup",
    "hourly_care",
    "extended_day",
    "no_show",
    "vacation_credit",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/**
 * Normalized attendance fact types (Slice 3). Operational Truth owns the raw
 * attendance facts; Consumption interprets them. Not every type is commercial.
 */
export const ATTENDANCE_FACT_TYPES = [
    "check_in",
    "check_out",
    "attendance_duration",
    "late_pickup",
    "early_pickup",
    "absence",
    "excused_absence",
    "no_show",
    "extra_day",
    "drop_in",
    "hourly_care",
    "extended_day",
    "room_transfer",
    "unexpected_attendance",
    "expected_attendance",
] as const;
export type AttendanceFactType = (typeof ATTENDANCE_FACT_TYPES)[number];

/**
 * A Consumption Candidate (Slice 3) — a normalized runtime interpretation of an
 * operational fact that MAY carry commercial significance. It is NOT a persisted
 * financial record. The pipeline turns one Candidate into zero-or-more Consumption
 * Events (or discards it with a reason).
 */
export type ConsumptionCandidate = {
    /** Operational domain: agreement | schedule | attendance. */
    domain: string;
    /** Domain-specific fact type (e.g. check_out, late_pickup, recurring). */
    factType: string;
    sourceEntityType: string;
    sourceEntityId: string;
    subjectType: string | null;
    subjectId: string | null;
    locationId: string | null;
    occursOn: string;
    /** The agreement that scopes/bills this candidate, when known. */
    agreementId: string | null;
    /** Normalized attributes carried from the fact (times, hours, flags). */
    attributes: Record<string, unknown>;
};

/**
 * The financial interpretation of a schedule mutation. Operational Scheduling
 * answers "where should the child be?"; this answers "what financially applies?".
 * Not every mutation is commercial — holiday_override / exception / no_op carry
 * no obligation by themselves.
 */
export const SCHEDULE_CHANGE_KINDS = [
    "recurring",
    "temporary",
    "extra_day",
    "drop_in",
    "replacement",
    "holiday_override",
    "exception",
    "no_op",
] as const;
export type ScheduleChangeKind = (typeof SCHEDULE_CHANGE_KINDS)[number];

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

    // --- Schedule consumption (Slice 2) ---
    /** How the schedule changed; decides the financial interpretation. Defaults to "recurring". */
    scheduleChangeKind?: ScheduleChangeKind | null;
    /** Rate Resolution schedule basis (e.g. three_day). Derived from weekdays/pattern when omitted. */
    scheduleBasis?: string | null;
    /** Weekday integers (0=Sun..6=Sat) when the basis must be derived from the pattern. */
    weekdays?: number[] | null;
    /** For a replacement: the prior schedule's basis (drives the proration credit). */
    priorScheduleBasis?: string | null;
    /** Age group for Rate Resolution. */
    ageGroupKey?: string | null;
    /** Optional rate plan disambiguator passed to Rate Resolution. */
    ratePlanKey?: string | null;
    /** Service period this consumption covers. */
    periodStart?: string | null;
    periodEnd?: string | null;
    /** Proration inputs (consumed with the proration policy method). */
    proratedDays?: number | null;
    periodDays?: number | null;

    // --- Attendance consumption (Slice 3) ---
    /** Normalized attendance fact type; routes the fact through the attendance interpreter. */
    attendanceFactType?: AttendanceFactType | null;
    /** Agreement that bills this fact (attendance facts reference an attendance event, not the agreement). */
    agreementId?: string | null;
    /** Check-in / check-out clock times (HH:MM, org-local) for duration + lateness. */
    checkInTime?: string | null;
    checkOutTime?: string | null;
    /** Late-pickup threshold (HH:MM); the scheduled end of care. */
    lateThresholdTime?: string | null;
    /** Hours of care (for hourly/extended billing). */
    hours?: number | null;
    /** Whether the child is vacation-credit eligible (policy-supplied) — gates absence → vacation credit. */
    vacationEligible?: boolean | null;

    // --- Correction identity (D12a) ---
    /**
     * original | correction | reversal. Defaults to 'original'. A correction
     * re-interprets the corrected values; a reversal yields zero directives and
     * reconciles the prior obligation by supersession. (Section 5.1/5.2.)
     */
    entryType?: OperationalFactEntryType | null;
    /**
     * The prior FACT id this correction/reversal restates or voids — for
     * attendance, the prior `child_attendance_events.id`. Lineage ONLY (never in
     * the idempotency key, DP-3); maps to the prior consumption event in the
     * service. Null on a correction/reversal => treated as original.
     */
    correctsFactId?: string | null;
};

/**
 * A normalized snapshot of the operational fact, stored on the Consumption Event
 * `context.fact_snapshot` so an obligation can be faithfully RECOMPUTED later
 * (Slice 4 review) by replaying it through the same pipeline. Provenance only —
 * never authoritative. Excludes the free-form `context` (avoids recursion).
 */
export function buildFactSnapshot(fact: OperationalFactDto): Record<string, unknown> {
    const rest: Record<string, unknown> = { ...fact };
    delete rest.context;
    return rest;
}

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
    /** D12a: the prior consumption event id this correction/reversal supersedes (lineage). */
    correctsEventId?: string | null;
};

/** A draft obligation the consumption event resolves to (preview shape). */
export type ResolvedObligationIntent = {
    obligationKind: ObligationKind;
    chargeTemplateId: string | null;
    serviceId: string | null;
    amountCents: number | null;
    currencyCode: string;
    responsibilityKey: string | null;
    occursOn: string | null;
    billableOn: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    reviewRequired: boolean;
    /** Whether this obligation should attempt a draft charge (a credit is preview-only). */
    draftable: boolean;
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
    /** D12a lineage: the prior event this correction/reversal supersedes. */
    corrects_event_id?: string | null;
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
    obligation_kind: ObligationKind | null;
    period_start: string | null;
    period_end: string | null;
    /** D12a: the correction event that superseded this obligation (provenance). */
    superseded_by_event_id?: string | null;
};

// ============================================================================
// D12a — correction reconciliation contract (types)
// ============================================================================

/** Read-only preview of which prior obligations a correction/reversal would retire. */
export type SupersededObligationPreview = {
    id: string;
    resolutionKey: string | null;
    obligationKind: string | null;
    priorAmountCents: number | null;
};

/** The supersession delta `previewConsumption` returns for a correction/reversal (writes nothing). */
export type ConsumptionSupersessionDelta = {
    priorConsumptionEventId: string | null;
    supersededObligations: SupersededObligationPreview[];
};

/** The reconciliation outcome `draftConsumption` returns for a correction/reversal. */
export type ConsumptionSupersededResult = {
    obligationIds: string[];
    voidedDraftChargeIds: string[];
    reparentedObligationIds: string[];
    priorConsumptionEventId: string | null;
};

/** Pre-resolved draft-charge intent carried in the reconciliation plan (no pricing in the RPC). */
export type ReconcileChargePlan = {
    op: "create" | "recalc";
    draftChargeId?: string | null;
    billableSourceId: string | null;
    chargeType?: string;
    chargeCategory: string | null;
    currencyCode: string;
    amountCents: number | null;
    serviceDate: string | null;
    occursOn: string | null;
    billableOn: string | null;
    chargeTemplateId: string | null;
    serviceId: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
};

/** One obligation in the reconciliation plan (all values pre-resolved in TS). */
export type ReconcileObligationPlan = {
    resolutionKey: string | null;
    obligationKind: string | null;
    chargeTemplateId: string | null;
    serviceId: string | null;
    amountCents: number | null;
    currencyCode: string;
    responsibilityKey: string | null;
    occursOn: string | null;
    billableOn: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    reviewRequired: boolean;
    status: ResolvedObligationStatus;
    /** Whether the RPC should mark review_status='stale' (amount/billable changed). */
    reviewStatusStale: boolean;
    explanation: Record<string, unknown>;
    /** Pre-resolved charge op (null => obligation carries no charge). */
    charge: ReconcileChargePlan | null;
};

/** The correction's OWN consumption event (fact-anchored idempotency key, DP-3). */
export type ReconcileCorrectionEventPlan = {
    idempotencyKey: string;
    eventTypeId: string | null;
    eventKey: string;
    sourceFamily: string;
    sourceEntityType: string;
    sourceEntityId: string;
    subjectType: string | null;
    subjectId: string | null;
    locationId: string | null;
    occursOn: string;
    effectiveOn: string | null;
    status: ConsumptionEventStatus;
    context: Record<string, unknown>;
};

/** The complete, pre-resolved reconciliation plan handed to the atomic RPC (DP-1). */
export type ReconcileConsumptionPlan = {
    correctionEvent: ReconcileCorrectionEventPlan;
    /** The prior FACT id (= prior consumption event's source_entity_id). */
    priorFactId: string;
    newObligations: ReconcileObligationPlan[];
    /** Draft charge ids of orphan obligations to retire (DP-2). */
    retireChargeIds: string[];
};
