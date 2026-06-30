/**
 * Draft Obligation Review service (Slice 4) — the PRE-POSTING review surface.
 *
 * Centers on `resolved_obligations` (the primary object); a draft Charge is a
 * downstream artifact. Lets an operator list / inspect / triage obligations and
 * understand *why Alloy thinks something should be charged* — without Posting.
 *
 * Review-only. It writes ONLY the review columns on resolved_obligations (and,
 * on recompute, the recomputed amount/billable). It NEVER posts, invoices,
 * collects payment, writes statements, or touches the ledger. Recompute re-runs
 * the EXISTING pipeline in PREVIEW mode (no charge writes) — Consumption is
 * recomputable by design.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { previewConsumption, type ConsumptionPreviewResult } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto, ResolvedObligationIntent } from "@/lib/operationalConsumption/consumptionTypes";
import type {
    ObligationDetail,
    ObligationExplanation,
    ObligationListFilters,
    ObligationListItem,
    ResolvedObligationReviewRow,
    ReviewStatus,
    TimelineStep,
} from "@/lib/operationalConsumption/obligationReviewTypes";

const OBLIGATIONS_TABLE = "resolved_obligations";
const EVENTS_TABLE = "consumption_events";
const CHARGES_TABLE = "charges";

type Code = OperationalEnrollmentServiceError["code"];
function fail(code: Code, message: string): never {
    throw new OperationalEnrollmentServiceError(code, message);
}

const OBLIGATION_COLUMNS =
    "id, org_id, consumption_event_id, charge_template_id, service_id, amount_cents, currency_code, occurs_on, billable_on, period_start, status, obligation_kind, review_required, review_status, reviewed_at, reviewed_by, suppression_reason, explanation, draft_charge_id, resolution_key, created_at";

type EventRow = {
    id: string;
    event_key: string | null;
    source_family: string | null;
    source_entity_type: string | null;
    source_entity_id: string | null;
    occurs_on: string | null;
    status: string | null;
    context: Record<string, unknown> | null;
};

type ChargeRow = { id: string; status: string; amount_cents: number | null; occurs_on: string | null; billable_on: string | null };

function eligibleForPosting(row: ResolvedObligationReviewRow): boolean {
    return row.review_status !== "suppressed" && row.status !== "no_charge";
}

function toListItem(row: ResolvedObligationReviewRow, event: EventRow | undefined): ObligationListItem {
    return {
        id: row.id,
        obligationKind: row.obligation_kind,
        status: row.status,
        reviewStatus: row.review_status,
        reviewRequired: row.review_required,
        amountCents: row.amount_cents,
        currencyCode: row.currency_code,
        occursOn: row.occurs_on,
        billableOn: row.billable_on,
        periodStart: row.period_start,
        eventKey: event?.event_key ?? null,
        sourceFamily: event?.source_family ?? null,
        sourceEntityType: event?.source_entity_type ?? null,
        sourceEntityId: event?.source_entity_id ?? null,
        draftChargeId: row.draft_charge_id,
        eligibleForPosting: eligibleForPosting(row),
        createdAt: row.created_at,
    };
}

async function loadOrgEvents(supabase: SupabaseClient, orgId: string): Promise<Map<string, EventRow>> {
    const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .select("id, event_key, source_family, source_entity_type, source_entity_id, occurs_on, status, context")
        .eq("org_id", orgId);
    if (error) fail("db_error", error.message);
    const map = new Map<string, EventRow>();
    for (const e of (data ?? []) as EventRow[]) map.set(e.id, e);
    return map;
}

/** List resolved obligations (the review queue), joined with their consumption event. */
export async function listResolvedObligations(
    supabase: SupabaseClient,
    orgId: string,
    filters: ObligationListFilters = {},
): Promise<ObligationListItem[]> {
    let q = supabase.from(OBLIGATIONS_TABLE).select(OBLIGATION_COLUMNS).eq("org_id", orgId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.reviewStatus) q = q.eq("review_status", filters.reviewStatus);
    if (filters.reviewRequired != null) q = q.eq("review_required", filters.reviewRequired);
    const { data, error } = await q;
    if (error) fail("db_error", error.message);
    const rows = (data ?? []) as ResolvedObligationReviewRow[];

    const events = await loadOrgEvents(supabase, orgId);
    let items = rows.map((r) => toListItem(r, events.get(r.consumption_event_id)));
    if (filters.sourceFamily) items = items.filter((i) => i.sourceFamily === filters.sourceFamily);
    if (filters.eventKey) items = items.filter((i) => i.eventKey === filters.eventKey);
    // Newest first (stable, string ISO compare).
    items.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return items;
}

async function loadObligation(supabase: SupabaseClient, orgId: string, id: string): Promise<ResolvedObligationReviewRow> {
    const { data, error } = await supabase.from(OBLIGATIONS_TABLE).select(OBLIGATION_COLUMNS).eq("org_id", orgId).eq("id", id);
    if (error) fail("db_error", error.message);
    const row = ((data ?? []) as ResolvedObligationReviewRow[])[0];
    if (!row) fail("not_found", "Resolved obligation not found");
    return row;
}

async function loadEvent(supabase: SupabaseClient, orgId: string, eventId: string): Promise<EventRow | null> {
    const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .select("id, event_key, source_family, source_entity_type, source_entity_id, occurs_on, status, context")
        .eq("org_id", orgId)
        .eq("id", eventId);
    if (error) fail("db_error", error.message);
    return ((data ?? []) as EventRow[])[0] ?? null;
}

async function loadCharge(supabase: SupabaseClient, orgId: string, chargeId: string | null): Promise<ChargeRow | null> {
    if (!chargeId) return null;
    const { data, error } = await supabase.from(CHARGES_TABLE).select("id, status, amount_cents, occurs_on, billable_on").eq("org_id", orgId).eq("id", chargeId);
    if (error) fail("db_error", error.message);
    return ((data ?? []) as ChargeRow[])[0] ?? null;
}

/** Reconstruct the operational fact from the event's stored snapshot (faithful recompute). */
function reconstructFact(event: EventRow | null): OperationalFactDto | null {
    const snap = (event?.context as { fact_snapshot?: Record<string, unknown> } | null)?.fact_snapshot;
    if (snap && typeof snap === "object") return { ...(snap as OperationalFactDto), context: null };
    if (!event) return null;
    // Fallback for rows written before fact_snapshot existed.
    return {
        eventKey: event.event_key ?? "",
        sourceFamily: event.source_family ?? "",
        sourceEntityType: event.source_entity_type ?? "",
        sourceEntityId: event.source_entity_id ?? "",
        occursOn: event.occurs_on,
    };
}

/** Re-run the pipeline (PREVIEW — no writes) and return the obligation matching the stored one. */
async function recomputePreview(
    supabase: SupabaseClient,
    orgId: string,
    row: ResolvedObligationReviewRow,
    event: EventRow | null,
    today: string,
): Promise<{ preview: ConsumptionPreviewResult; matched: ResolvedObligationIntent | null } | null> {
    const fact = reconstructFact(event);
    // Attendance/schedule facts derive their event key from the change/fact type,
    // so an empty eventKey is valid as long as the fact is otherwise routable.
    const routable = !!fact && (!!fact.eventKey || !!fact.attendanceFactType || !!fact.scheduleChangeKind || fact.sourceFamily === "attendance" || fact.sourceFamily === "schedule");
    if (!fact || !routable || !fact.sourceEntityId) return null;
    let preview: ConsumptionPreviewResult;
    try {
        preview = await previewConsumption(supabase, orgId, fact, today);
    } catch {
        return null;
    }
    const obs = preview.resolution.obligations;
    const matched =
        obs.find((o) => o.resolutionKey && o.resolutionKey === row.resolution_key) ??
        obs.find((o) => o.obligationKind === row.obligation_kind) ??
        null;
    return { preview, matched };
}

/** Build the Operational Fact → Candidate → Event → Obligation → Draft Charge timeline. Pure. */
export function buildObligationTimeline(row: ResolvedObligationReviewRow, event: EventRow | null, charge: ChargeRow | null): TimelineStep[] {
    const candidate = (event?.context as { fact_snapshot?: { sourceFamily?: string } } | null)?.fact_snapshot;
    return [
        { stage: "operational_fact", label: "Operational fact", at: event?.occurs_on ?? row.occurs_on ?? null, detail: `${event?.source_entity_type ?? "?"} ${event?.source_entity_id ?? ""}`.trim(), present: !!event },
        { stage: "candidate", label: "Consumption candidate", at: event?.occurs_on ?? null, detail: candidate ? `${event?.source_family ?? "?"} fact normalized` : "normalized at runtime", present: !!event },
        { stage: "consumption_event", label: "Consumption event", at: event?.occurs_on ?? null, detail: `${event?.event_key ?? "?"} (${event?.status ?? "?"})`, present: !!event },
        { stage: "resolved_obligation", label: "Resolved obligation", at: row.created_at, detail: `${row.obligation_kind ?? "?"} · ${row.status} · review:${row.review_status}`, present: true },
        { stage: "draft_charge", label: "Draft charge", at: charge?.occurs_on ?? null, detail: charge ? `${charge.status} · ${charge.amount_cents ?? "?"}¢` : "none (preview-only / suppressed / no charge)", present: !!charge },
    ];
}

/** Assemble the reusable "why does this exist?" explanation. Combines stored data with a fresh derivation. */
export function buildObligationExplanation(
    row: ResolvedObligationReviewRow,
    event: EventRow | null,
    recompute: { preview: ConsumptionPreviewResult; matched: ResolvedObligationIntent | null } | null,
): ObligationExplanation {
    const storedExpl = (row.explanation ?? {}) as Record<string, unknown>;
    const preview = recompute?.preview ?? null;
    const matched = recompute?.matched ?? null;
    const commercial = preview?.commercialObjectsUsed ?? [];
    const ratePlan = commercial.find((c) => c.kind === "rate_plan") ?? null;
    const rateRule = commercial.find((c) => c.kind === "rate_rule") ?? null;
    const template = commercial.find((c) => c.kind === "charge_template") ?? null;
    const recomputedAmount = matched?.amountCents ?? null;
    const interpretationSummary =
        preview?.interpretation
            ? `schedule:${preview.interpretation.scheduleChangeKind}`
            : preview?.attendanceInterpretation
              ? `attendance:${preview.attendanceInterpretation.attendanceFactType}`
              : (storedExpl.directive_reason as string) ?? null;
    const discardReason = preview?.attendanceInterpretation?.discardReason ?? preview?.interpretation?.noImpactReason ?? null;

    return {
        sourceFact: {
            sourceFamily: event?.source_family ?? null,
            sourceEntityType: event?.source_entity_type ?? null,
            sourceEntityId: event?.source_entity_id ?? null,
            occursOn: event?.occurs_on ?? row.occurs_on ?? null,
            factType: (preview?.candidate?.factType ?? (event?.context as { attendance_fact_type?: string; schedule_change_kind?: string } | null)?.attendance_fact_type ?? (event?.context as { schedule_change_kind?: string } | null)?.schedule_change_kind) ?? null,
        },
        candidate: preview?.candidate ? { domain: preview.candidate.domain, factType: preview.candidate.factType } : null,
        consumptionEvent: { id: row.consumption_event_id, eventKey: event?.event_key ?? null, status: event?.status ?? null },
        interpretation: { summary: interpretationSummary, discardReason },
        matchedService: preview?.matchedCommercial?.serviceId ? { id: preview.matchedCommercial.serviceId, label: preview.matchedCommercial.chargeTemplateLabel } : null,
        matchedRatePlan: ratePlan ? { label: ratePlan.label, detail: ratePlan.detail } : null,
        matchedRateRule: rateRule ? { label: rateRule.label, detail: rateRule.detail } : null,
        matchedChargeTemplate: template
            ? { key: (storedExpl.charge_template_key as string) ?? null, label: template.label, amountStrategy: (storedExpl.amount_strategy as string) ?? null }
            : (storedExpl.charge_template_key
                ? { key: storedExpl.charge_template_key as string, label: null, amountStrategy: (storedExpl.amount_strategy as string) ?? null }
                : null),
        matchedPolicies: (preview?.policiesApplied ?? []).map((p) => ({ policyType: p.policyType, scope: p.scope, applied: p.applied, effect: p.effect })),
        amountCalculation: {
            amountCents: row.amount_cents,
            currencyCode: row.currency_code,
            strategy: (storedExpl.amount_strategy as string) ?? null,
            rateAmountCents: (storedExpl.rate_amount_cents as number) ?? null,
            unitMultiplier: (storedExpl.unit_multiplier as number) ?? null,
            note: (storedExpl.note as string) ?? null,
        },
        suppressionReason: row.suppression_reason,
        recomputeStatus: matched
            ? { changed: recomputedAmount !== row.amount_cents, currentAmountCents: row.amount_cents, recomputedAmountCents: recomputedAmount }
            : null,
    };
}

/** Full obligation detail: row + event + draft charge + explanation + timeline. No write. */
export async function getObligationDetail(supabase: SupabaseClient, orgId: string, id: string, today: string): Promise<ObligationDetail> {
    const row = await loadObligation(supabase, orgId, id);
    const event = await loadEvent(supabase, orgId, row.consumption_event_id);
    const charge = await loadCharge(supabase, orgId, row.draft_charge_id);
    const recompute = await recomputePreview(supabase, orgId, row, event, today);

    const base = toListItem(row, event ?? undefined);
    return {
        ...base,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        suppressionReason: row.suppression_reason,
        consumptionEvent: event
            ? { id: event.id, eventKey: event.event_key, sourceFamily: event.source_family, sourceEntityType: event.source_entity_type, sourceEntityId: event.source_entity_id, occursOn: event.occurs_on, status: event.status }
            : null,
        draftCharge: charge ? { id: charge.id, status: charge.status, amountCents: charge.amount_cents, occursOn: charge.occurs_on, billableOn: charge.billable_on } : null,
        explanation: buildObligationExplanation(row, event, recompute),
        timeline: buildObligationTimeline(row, event, charge),
    };
}

export type RecomputeResult = {
    changed: boolean;
    current: { amountCents: number | null; billableOn: string | null };
    recomputed: { amountCents: number | null; billableOn: string | null } | null;
    persisted: boolean;
    reason?: string;
};

/** Recompute an obligation by replaying the pipeline (preview). Optionally persist drift (→ stale). No charge writes. */
export async function recomputeObligation(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
    today: string,
    opts: { persist?: boolean; actorUserId?: string | null } = {},
): Promise<RecomputeResult> {
    const row = await loadObligation(supabase, orgId, id);
    const event = await loadEvent(supabase, orgId, row.consumption_event_id);
    const rc = await recomputePreview(supabase, orgId, row, event, today);
    const current = { amountCents: row.amount_cents, billableOn: row.billable_on };
    if (!rc || !rc.matched) {
        return { changed: false, current, recomputed: null, persisted: false, reason: "fact could not be replayed (no snapshot or no longer resolvable)" };
    }
    const recomputed = { amountCents: rc.matched.amountCents, billableOn: rc.matched.billableOn };
    const changed = recomputed.amountCents !== current.amountCents || recomputed.billableOn !== current.billableOn;

    if (opts.persist && changed) {
        const { error } = await supabase
            .from(OBLIGATIONS_TABLE)
            .update({ amount_cents: recomputed.amountCents, billable_on: recomputed.billableOn, review_status: "stale", updated_by: opts.actorUserId ?? null })
            .eq("org_id", orgId)
            .eq("id", id);
        if (error) fail("db_error", error.message);
    }
    return { changed, current, recomputed, persisted: Boolean(opts.persist && changed) };
}

const VALID_TRANSITIONS: Record<string, ReviewStatus> = {
    mark_reviewed: "reviewed",
    flag: "review_required",
    suppress: "suppressed",
};

/** Apply a review-only action. Writes only review columns (recompute also re-derives amount). No posting. */
export async function reviewObligation(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
    action: string,
    today: string,
    opts: { reason?: string | null; actorUserId?: string | null } = {},
): Promise<ObligationDetail> {
    const row = await loadObligation(supabase, orgId, id);

    if (action === "recompute") {
        await recomputeObligation(supabase, orgId, id, today, { persist: true, actorUserId: opts.actorUserId });
        return getObligationDetail(supabase, orgId, id, today);
    }

    let update: Record<string, unknown>;
    if (action === "mark_reviewed" || action === "flag" || action === "suppress") {
        const next = VALID_TRANSITIONS[action];
        update = {
            review_status: next,
            reviewed_at: action === "mark_reviewed" ? new Date().toISOString() : row.reviewed_at,
            reviewed_by: action === "mark_reviewed" ? opts.actorUserId ?? null : row.reviewed_by,
            suppression_reason: action === "suppress" ? opts.reason ?? "suppressed by operator review" : row.suppression_reason,
            updated_by: opts.actorUserId ?? null,
        };
    } else if (action === "restore") {
        update = {
            review_status: row.review_required ? "review_required" : "pending",
            suppression_reason: null,
            updated_by: opts.actorUserId ?? null,
        };
    } else {
        fail("invalid_input", `Unknown review action: ${action}`);
    }

    const { error } = await supabase.from(OBLIGATIONS_TABLE).update(update).eq("org_id", orgId).eq("id", id);
    if (error) fail("db_error", error.message);
    return getObligationDetail(supabase, orgId, id, today);
}
