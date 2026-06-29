/**
 * Operational Consumption service (Slice 1) — the runtime layer between
 * Operational Execution and Commercial / Financial Resolution.
 *
 *   Operational Fact -> Consumption Event -> Resolved Obligation -> Draft Charge.
 *
 * Given a normalized operational fact, it (1) looks up the Consumption Event
 * Type registry, (2) maps to the Commercial Model Charge Template by key, (3)
 * DELEGATES pricing/timing/review to the EXISTING Charge Template resolver
 * (chargeLifecycleService — Slice D), and (4) produces Resolved Obligation
 * previews. In `draft` mode it persists only safe draft objects: the Consumption
 * Event, the Resolved Obligation, and (via the existing lifecycle service) an
 * idempotent status='draft' charge. It NEVER posts, never writes
 * ledger/invoice/payment, and never mutates a posted charge.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { ENROLLMENT_AGREEMENT_ENTITY_TYPE } from "@/lib/childcareOperational/operationalEnrollmentEvents";
import { listChargeTemplates } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
    type ChargePreviewResult,
    type SimulateArgs,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { resolveConsumption, type ConsumptionResolution } from "@/lib/operationalConsumption/resolveConsumption";
import type {
    ConsumptionEventTypeRow,
    OperationalFactDto,
    ResolvedObligationIntent,
} from "@/lib/operationalConsumption/consumptionTypes";

const EVENT_TYPES_TABLE = "consumption_event_types";
const EVENTS_TABLE = "consumption_events";
const OBLIGATIONS_TABLE = "resolved_obligations";

type Code = OperationalEnrollmentServiceError["code"];
function fail(code: Code, message: string): never {
    throw new OperationalEnrollmentServiceError(code, message);
}

/** A matched Commercial Model object, surfaced for the preview (no UUIDs leak to UI labels). */
export type MatchedCommercial = {
    chargeTemplateId: string;
    chargeTemplateKey: string;
    chargeTemplateLabel: string;
    serviceId: string | null;
};

export type ConsumptionPreviewResult = {
    fact: OperationalFactDto;
    eventType: {
        id: string;
        eventKey: string;
        label: string;
        sourceFamily: string;
        chargeTemplateKey: string | null;
        scope: "org" | "global";
    } | null;
    matchedCommercial: MatchedCommercial | null;
    resolution: ConsumptionResolution;
    /** Slice D charge preview for the matched template (null when no template matched). */
    chargePreview: ChargePreviewResult | null;
};

export type ConsumptionDraftResult = ConsumptionPreviewResult & {
    persisted: {
        consumptionEventId: string;
        resolvedObligationIds: string[];
        draftChargeId: string | null;
        draftChargeStatus: string | null;
    };
};

/** Load the Consumption Event Type for a key — org override preferred over global. */
async function loadEventType(
    supabase: SupabaseClient,
    orgId: string,
    eventKey: string,
): Promise<ConsumptionEventTypeRow | null> {
    const { data, error } = await supabase
        .from(EVENT_TYPES_TABLE)
        .select(
            "id, org_id, event_key, label, source_family, description, charge_template_key, default_responsibility_key, is_active, effective_start, effective_end, metadata",
        )
        .eq("event_key", eventKey);
    if (error) fail("db_error", error.message);
    const rows = (data ?? []) as ConsumptionEventTypeRow[];
    const eligible = rows.filter((r) => r.org_id === orgId || r.org_id === null);
    if (eligible.length === 0) return null;
    // Prefer an org-specific override over a global template.
    return eligible.sort((a, b) => (a.org_id === orgId ? -1 : 1) - (b.org_id === orgId ? -1 : 1))[0];
}

/** Find the org's active Charge Template for a template key (Commercial Model). */
async function loadTemplateByKey(
    supabase: SupabaseClient,
    orgId: string,
    templateKey: string | null,
): Promise<ChargeTemplateRow | null> {
    if (!templateKey) return null;
    const templates = await listChargeTemplates(supabase, orgId);
    return templates.find((t) => t.template_key === templateKey && t.is_active !== false) ?? null;
}

/** Map a fact's billable source to the agreement id when the source family is `agreement`. */
function agreementIdFromFact(fact: OperationalFactDto): string | null {
    if (fact.sourceFamily === "agreement" || fact.sourceEntityType === ENROLLMENT_AGREEMENT_ENTITY_TYPE) {
        return fact.sourceEntityId || null;
    }
    return null;
}

function simulateArgsFromFact(
    fact: OperationalFactDto,
    template: ChargeTemplateRow,
    today: string,
): SimulateArgs {
    return {
        templateId: template.id,
        agreementId: agreementIdFromFact(fact),
        eventDate: fact.eventDate ?? null,
        servicePeriodStart: fact.servicePeriodStart ?? null,
        quantity: fact.quantity ?? null,
        unitAmountCents: fact.unitAmountCents ?? null,
        today,
    };
}

function eventTypeSummary(eventType: ConsumptionEventTypeRow, orgId: string): ConsumptionPreviewResult["eventType"] {
    return {
        id: eventType.id,
        eventKey: eventType.event_key,
        label: eventType.label,
        sourceFamily: eventType.source_family,
        chargeTemplateKey: eventType.charge_template_key,
        scope: eventType.org_id === orgId ? "org" : "global",
    };
}

/**
 * Resolve a fact into a Consumption Event + obligations. Writes NOTHING.
 * `requireEventType=false` lets preview report an unregistered fact gracefully.
 */
export async function previewConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    if (!fact.eventKey?.trim()) fail("invalid_input", "event_key is required");
    if (!fact.sourceEntityId?.trim()) fail("invalid_input", "source_entity_id is required");

    const eventType = await loadEventType(supabase, orgId, fact.eventKey.trim());
    if (!eventType) fail("not_found", `No consumption event type registered for '${fact.eventKey}'`);

    const template = await loadTemplateByKey(supabase, orgId, eventType.charge_template_key);
    let chargePreview: ChargePreviewResult | null = null;
    if (template) {
        chargePreview = await previewTemplateCharge(supabase, orgId, simulateArgsFromFact(fact, template, today));
    }

    const resolution = resolveConsumption(fact, eventType, chargePreview?.intent ?? null, today);
    const matchedCommercial: MatchedCommercial | null = template
        ? {
              chargeTemplateId: template.id,
              chargeTemplateKey: template.template_key,
              chargeTemplateLabel: template.label,
              serviceId: template.service_id,
          }
        : null;

    return { fact, eventType: eventTypeSummary(eventType, orgId), matchedCommercial, resolution, chargePreview };
}

async function findConsumptionEventByIdempotency(
    supabase: SupabaseClient,
    orgId: string,
    idempotencyKey: string,
): Promise<{ id: string } | null> {
    const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .select("id")
        .eq("org_id", orgId)
        .eq("idempotency_key", idempotencyKey);
    if (error) fail("db_error", error.message);
    const rows = (data ?? []) as { id: string }[];
    return rows[0] ?? null;
}

async function upsertConsumptionEvent(
    supabase: SupabaseClient,
    orgId: string,
    resolution: ConsumptionResolution,
    actorUserId: string | null,
): Promise<string> {
    const e = resolution.event;
    const existing = await findConsumptionEventByIdempotency(supabase, orgId, e.idempotencyKey);
    const row = {
        org_id: orgId,
        location_id: e.locationId,
        event_type_id: e.eventTypeId,
        source_family: e.sourceFamily,
        event_key: e.eventKey,
        source_entity_type: e.sourceEntityType,
        source_entity_id: e.sourceEntityId,
        subject_type: e.subjectType,
        subject_id: e.subjectId,
        occurs_on: e.occursOn,
        effective_on: e.effectiveOn,
        status: e.status,
        context: e.context,
        idempotency_key: e.idempotencyKey,
    };
    if (existing) {
        const { data, error } = await supabase
            .from(EVENTS_TABLE)
            .update({ status: row.status, context: row.context, updated_by: actorUserId })
            .eq("org_id", orgId)
            .eq("id", existing.id)
            .select("id")
            .single();
        if (error || !data) fail("db_error", error?.message ?? "consumption event update failed");
        return (data as { id: string }).id;
    }
    const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .insert({ ...row, created_by: actorUserId })
        .select("id")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "consumption event insert failed");
    return (data as { id: string }).id;
}

async function upsertObligation(
    supabase: SupabaseClient,
    orgId: string,
    consumptionEventId: string,
    obligation: ResolvedObligationIntent,
    draftChargeId: string | null,
    status: ResolvedObligationIntent["status"],
    actorUserId: string | null,
): Promise<string> {
    // Idempotent on (org_id, resolution_key) when present.
    let existing: { id: string } | null = null;
    if (obligation.resolutionKey) {
        const { data, error } = await supabase
            .from(OBLIGATIONS_TABLE)
            .select("id")
            .eq("org_id", orgId)
            .eq("resolution_key", obligation.resolutionKey);
        if (error) fail("db_error", error.message);
        existing = ((data ?? []) as { id: string }[])[0] ?? null;
    }
    const row = {
        org_id: orgId,
        consumption_event_id: consumptionEventId,
        charge_template_id: obligation.chargeTemplateId,
        service_id: obligation.serviceId,
        amount_cents: obligation.amountCents,
        currency_code: obligation.currencyCode,
        responsibility_key: obligation.responsibilityKey,
        occurs_on: obligation.occursOn,
        billable_on: obligation.billableOn,
        status,
        review_required: obligation.reviewRequired,
        explanation: obligation.explanation,
        draft_charge_id: draftChargeId,
        resolution_key: obligation.resolutionKey,
    };
    if (existing) {
        const { data, error } = await supabase
            .from(OBLIGATIONS_TABLE)
            .update({
                amount_cents: row.amount_cents,
                billable_on: row.billable_on,
                status: row.status,
                review_required: row.review_required,
                explanation: row.explanation,
                draft_charge_id: row.draft_charge_id,
                updated_by: actorUserId,
            })
            .eq("org_id", orgId)
            .eq("id", existing.id)
            .select("id")
            .single();
        if (error || !data) fail("db_error", error?.message ?? "obligation update failed");
        return (data as { id: string }).id;
    }
    const { data, error } = await supabase
        .from(OBLIGATIONS_TABLE)
        .insert({ ...row, created_by: actorUserId })
        .select("id")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "obligation insert failed");
    return (data as { id: string }).id;
}

/**
 * Persist a Consumption Event, its Resolved Obligation(s), and (via the existing
 * lifecycle service) an idempotent DRAFT charge. Re-running is idempotent. Never
 * posts; never mutates a posted charge. Preview-only computation lives in
 * previewConsumption — this is the only path that writes.
 */
export async function draftConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
    actorUserId: string | null = null,
): Promise<ConsumptionDraftResult> {
    const preview = await previewConsumption(supabase, orgId, fact, today);

    const consumptionEventId = await upsertConsumptionEvent(supabase, orgId, preview.resolution, actorUserId);

    let draftChargeId: string | null = null;
    let draftChargeStatus: string | null = null;
    const resolvedObligationIds: string[] = [];

    // Write the draft charge through the EXISTING Commercial Model lifecycle service.
    if (preview.matchedCommercial && agreementIdFromFact(fact)) {
        const template = await loadTemplateByKey(supabase, orgId, preview.eventType?.chargeTemplateKey ?? null);
        if (template) {
            const result = await writeTemplateDraftCharge(supabase, orgId, {
                ...simulateArgsFromFact(fact, template, today),
                actorUserId,
            });
            draftChargeStatus = result.status;
            if (result.status === "created" || result.status === "recalculated" || result.status === "unchanged") {
                draftChargeId = result.chargeId;
            }
            // skipped_posted / not_writable => leave draftChargeId null (never link a posted charge).
        }
    }

    for (const obligation of preview.resolution.obligations) {
        // 'drafted' once a draft charge is linked; otherwise it stays a preview.
        const status: ResolvedObligationIntent["status"] = draftChargeId ? "drafted" : "previewed";
        const id = await upsertObligation(supabase, orgId, consumptionEventId, obligation, draftChargeId, status, actorUserId);
        resolvedObligationIds.push(id);
    }

    return {
        ...preview,
        persisted: { consumptionEventId, resolvedObligationIds, draftChargeId, draftChargeStatus },
    };
}
