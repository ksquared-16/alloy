/**
 * Draft Obligation Review — code-owned vocabularies + view shapes (Slice 4).
 *
 * Mirror of the review columns added in
 *   supabase/migrations/20260709120000_draft_obligation_review_slice4.sql
 *
 * This is PRE-POSTING review. Operators inspect and triage Resolved Obligations
 * (the primary object) before any Posting exists. Nothing here posts money,
 * invoices, collects payment, or writes the ledger.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

/** Pre-posting review lifecycle — DISTINCT from resolved_obligations.status and charges.status. */
export const REVIEW_STATUSES = ["pending", "review_required", "reviewed", "suppressed", "stale"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
    pending: "Pending",
    review_required: "Review required",
    reviewed: "Reviewed",
    suppressed: "Suppressed",
    stale: "Stale (recomputed)",
};

/** Review-only actions. Posting / invoicing / payment / ledger are NOT review actions. */
export const REVIEW_ACTIONS = ["mark_reviewed", "flag", "suppress", "restore", "recompute"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** A row in the obligation review queue (obligation joined with its consumption event). */
export type ObligationListItem = {
    id: string;
    obligationKind: string | null;
    status: string; // resolution lifecycle (previewed | drafted | no_charge | superseded)
    reviewStatus: ReviewStatus;
    reviewRequired: boolean;
    amountCents: number | null;
    currencyCode: string;
    occursOn: string | null;
    billableOn: string | null;
    periodStart: string | null;
    eventKey: string | null;
    sourceFamily: string | null;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    draftChargeId: string | null;
    /** Whether this obligation would remain eligible for FUTURE Posting (not suppressed / not no_charge). */
    eligibleForPosting: boolean;
    createdAt: string | null;
};

/** A step on the Operational Fact → … → Draft Charge timeline. */
export type TimelineStep = {
    stage: "operational_fact" | "candidate" | "consumption_event" | "resolved_obligation" | "draft_charge";
    label: string;
    at: string | null;
    detail: string;
    present: boolean;
};

/** Reusable, normalized "why does this exist?" explanation (consumable by BOS later). */
export type ObligationExplanation = {
    sourceFact: { sourceFamily: string | null; sourceEntityType: string | null; sourceEntityId: string | null; occursOn: string | null; factType: string | null };
    candidate: { domain: string | null; factType: string | null } | null;
    consumptionEvent: { id: string; eventKey: string | null; status: string | null };
    interpretation: { summary: string | null; discardReason: string | null };
    matchedService: { id: string; label: string } | null;
    matchedRatePlan: { label: string; detail: string } | null;
    matchedRateRule: { label: string; detail: string } | null;
    matchedChargeTemplate: { key: string | null; label: string | null; amountStrategy: string | null } | null;
    matchedPolicies: { policyType: string; scope: string | null; applied: boolean; effect: string }[];
    amountCalculation: { amountCents: number | null; currencyCode: string; strategy: string | null; rateAmountCents: number | null; unitMultiplier: number | null; note: string | null };
    suppressionReason: string | null;
    recomputeStatus: { changed: boolean; currentAmountCents: number | null; recomputedAmountCents: number | null } | null;
};

export type ObligationDetail = ObligationListItem & {
    reviewedAt: string | null;
    reviewedBy: string | null;
    suppressionReason: string | null;
    consumptionEvent: {
        id: string;
        eventKey: string | null;
        sourceFamily: string | null;
        sourceEntityType: string | null;
        sourceEntityId: string | null;
        occursOn: string | null;
        status: string | null;
    } | null;
    draftCharge: { id: string; status: string; amountCents: number | null; occursOn: string | null; billableOn: string | null } | null;
    explanation: ObligationExplanation;
    timeline: TimelineStep[];
};

export type ObligationListFilters = {
    status?: string | null;
    reviewStatus?: ReviewStatus | null;
    reviewRequired?: boolean | null;
    sourceFamily?: string | null;
    eventKey?: string | null;
};

/** Persisted-row shape including the Slice 4 review columns (for the service/tests). */
export type ResolvedObligationReviewRow = {
    id: string;
    org_id: string;
    consumption_event_id: string;
    charge_template_id: string | null;
    service_id: string | null;
    amount_cents: number | null;
    currency_code: string;
    occurs_on: string | null;
    billable_on: string | null;
    period_start: string | null;
    status: string;
    obligation_kind: string | null;
    review_required: boolean;
    review_status: ReviewStatus;
    reviewed_at: string | null;
    reviewed_by: string | null;
    suppression_reason: string | null;
    explanation: Record<string, unknown> | null;
    draft_charge_id: string | null;
    resolution_key: string | null;
    created_at: string | null;
    /** D12a: the correction event that superseded this obligation (provenance). */
    superseded_by_event_id?: string | null;
};
