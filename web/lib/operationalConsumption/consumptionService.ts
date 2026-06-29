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
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { resolveRate, type RateResolution } from "@/lib/financials/rates/resolveRate";
import type { ChildcareRatePlanRow, ChildcareRateRuleRow, ScheduleBasis } from "@/lib/financials/rates/rateTypes";
import {
    getOperationalScheduleAssignmentForAgreement,
} from "@/lib/childcareOperational/scheduleAssignmentService";
import {
    interpretSchedule,
    prorateAmountCents,
    weekdaysToScheduleBasis,
    type ConsumptionDirective,
    type ScheduleInterpretation,
} from "@/lib/operationalConsumption/scheduleInterpretation";
import type {
    ConsumptionEventIntent,
    ConsumptionEventTypeRow,
    ObligationKind,
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
    // --- Slice 2 explanation (schedule consumption) ---
    /** The schedule financial interpretation (null for non-schedule facts). */
    interpretation?: ScheduleInterpretation | null;
    /** Every Commercial Model object the resolution consulted (rate plan/rule, template, service). */
    commercialObjectsUsed?: CommercialObjectRef[];
    /** Every Financial Policy applied (or considered) and its effect. */
    policiesApplied?: PolicyApplication[];
};

/** A Commercial Model object surfaced in the explanation (labels, not raw UUIDs). */
export type CommercialObjectRef = {
    kind: "rate_plan" | "rate_rule" | "charge_template" | "service";
    label: string;
    detail: string;
    matched: boolean;
};

/** A Financial Policy applied during resolution (explanation). */
export type PolicyApplication = {
    policyType: string;
    scope: string | null;
    value: Record<string, unknown> | null;
    applied: boolean;
    effect: string;
};

export type ConsumptionDraftResult = ConsumptionPreviewResult & {
    persisted: {
        consumptionEventId: string;
        resolvedObligationIds: string[];
        /** The first drafted charge (back-compat); see `obligations` for the per-obligation breakdown. */
        draftChargeId: string | null;
        draftChargeStatus: string | null;
        obligations: { obligationKind: ObligationKind; draftChargeId: string | null; draftChargeStatus: string | null }[];
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
/** A schedule fact is one whose family is schedule (by event key prefix, family, or change kind). */
function isScheduleFact(fact: OperationalFactDto): boolean {
    return (
        fact.sourceFamily === "schedule" ||
        fact.scheduleChangeKind != null ||
        (typeof fact.eventKey === "string" && fact.eventKey.startsWith("schedule."))
    );
}

export async function previewConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    if (!fact.sourceEntityId?.trim()) fail("invalid_input", "source_entity_id is required");
    if (isScheduleFact(fact)) return previewScheduleConsumption(supabase, orgId, fact, today);

    if (!fact.eventKey?.trim()) fail("invalid_input", "event_key is required");
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

    return {
        fact,
        eventType: eventTypeSummary(eventType, orgId),
        matchedCommercial,
        resolution,
        chargePreview,
        interpretation: null,
        commercialObjectsUsed: matchedCommercial
            ? [{ kind: "charge_template", label: matchedCommercial.chargeTemplateLabel, detail: `key=${matchedCommercial.chargeTemplateKey}`, matched: true }]
            : [],
        policiesApplied: [],
    };
}

// ============================================================================
// Schedule consumption (Slice 2): Agreement + Schedule -> recurring tuition /
// proration / drop-in / extra-day, resolved through Rate Resolution + the Charge
// Template resolver + Financial Policies. One fact may resolve to MANY obligations.
// ============================================================================

const RATE_PLANS_TABLE = "childcare_rate_plans";
const RATE_RULES_TABLE = "childcare_rate_rules";
const AGREEMENTS_TABLE = "child_enrollment_agreements";
const PATTERNS_TABLE = "schedule_patterns";

function firstOfMonth(ymd: string): string {
    return `${ymd.slice(0, 7)}-01`;
}

async function listRows<T>(supabase: SupabaseClient, table: string, orgId: string): Promise<T[]> {
    const { data, error } = await supabase.from(table).select("*").eq("org_id", orgId);
    if (error) fail("db_error", error.message);
    return (data ?? []) as T[];
}

type AgreementScope = { siteLocationId: string | null; ageGroupKey: string | null; agreementStatus: string | null };

/** Resolve the Rate Resolution scope (site + age) for the fact, loading the agreement when present. */
async function resolveAgreementScope(supabase: SupabaseClient, orgId: string, fact: OperationalFactDto, agreementId: string | null): Promise<AgreementScope> {
    let siteLocationId = fact.locationId ?? null;
    let agreementStatus: string | null = null;
    if (agreementId) {
        const { data, error } = await supabase
            .from(AGREEMENTS_TABLE)
            .select("id, site_location_id, status, start_date, customer_member_id")
            .eq("org_id", orgId)
            .eq("id", agreementId);
        if (error) fail("db_error", error.message);
        const a = ((data ?? []) as { site_location_id?: string; status?: string }[])[0];
        if (a) {
            siteLocationId = siteLocationId ?? a.site_location_id ?? null;
            agreementStatus = a.status ?? null;
        }
    }
    return { siteLocationId, ageGroupKey: fact.ageGroupKey ?? null, agreementStatus };
}

/** Derive the schedule basis: explicit fact value, else weekdays, else the agreement's active pattern. */
async function deriveScheduleBasis(supabase: SupabaseClient, orgId: string, fact: OperationalFactDto, agreementId: string | null): Promise<string | null> {
    if (fact.scheduleBasis) return fact.scheduleBasis;
    if (fact.weekdays && fact.weekdays.length) return weekdaysToScheduleBasis(fact.weekdays);
    if (agreementId) {
        const asg = await getOperationalScheduleAssignmentForAgreement(supabase, orgId, agreementId);
        if (asg) {
            const { data, error } = await supabase.from(PATTERNS_TABLE).select("weekdays, schedule_type_key").eq("org_id", orgId).eq("id", asg.schedule_pattern_id);
            if (error) fail("db_error", error.message);
            const p = ((data ?? []) as { weekdays?: number[]; schedule_type_key?: string }[])[0];
            if (p) return weekdaysToScheduleBasis(p.weekdays ?? [], p.schedule_type_key ?? null);
        }
    }
    return null;
}

function scheduleSimulateArgs(fact: OperationalFactDto, template: ChargeTemplateRow, rateAmount: number | null, periodStart: string, today: string): SimulateArgs {
    return {
        templateId: template.id,
        agreementId: agreementIdFromFact(fact),
        resolvedAmountCents: rateAmount,
        servicePeriodStart: periodStart,
        eventDate: fact.eventDate ?? fact.occursOn ?? today,
        today,
    };
}

/** Resolve a fact into a Consumption Event + zero-or-more obligations via the Commercial Model. No write. */
async function previewScheduleConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    const agreementId = agreementIdFromFact(fact);
    const scope = await resolveAgreementScope(supabase, orgId, fact, agreementId);
    const derivedBasis = await deriveScheduleBasis(supabase, orgId, fact, agreementId);
    const interpretation = interpretSchedule({ ...fact, scheduleBasis: fact.scheduleBasis ?? derivedBasis });

    const plans = await listRows<ChildcareRatePlanRow>(supabase, RATE_PLANS_TABLE, orgId);
    const rules = await listRows<ChildcareRateRuleRow>(supabase, RATE_RULES_TABLE, orgId);
    const policies = await listFinancialPolicies(supabase, orgId);

    const periodStart = fact.periodStart ?? fact.servicePeriodStart ?? firstOfMonth(today);
    const policyCtx = { locationId: scope.siteLocationId ?? undefined, serviceId: undefined, ratePlanId: undefined };
    const proration = resolveFinancialPolicy(policies, "proration", policyCtx, periodStart);
    const cadence = resolveFinancialPolicy(policies, "billing_cadence", policyCtx, periodStart);
    const grace = resolveFinancialPolicy(policies, "grace_period", policyCtx, periodStart);
    const reviewPolicy = resolveFinancialPolicy(policies, "posting_review", policyCtx, periodStart);
    const reviewByPolicy = reviewPolicy.resolved ? reviewPolicy.policy.value.required === true : false;

    const policiesApplied: PolicyApplication[] = [
        { policyType: "proration", scope: proration.resolved ? proration.sourceScope : null, value: proration.resolved ? proration.policy.value : null, applied: interpretation.directives.some((d) => d.obligationKind === "proration" || d.obligationKind === "proration_credit"), effect: proration.resolved ? `method=${(proration.policy.value as { method?: string }).method ?? "?"}` : "no proration policy (default none)" },
        { policyType: "billing_cadence", scope: cadence.resolved ? cadence.sourceScope : null, value: cadence.resolved ? cadence.policy.value : null, applied: true, effect: cadence.resolved ? `cadence=${(cadence.policy.value as { cadence?: string }).cadence ?? "?"}` : "no cadence policy (template billable strategy governs)" },
        { policyType: "grace_period", scope: grace.resolved ? grace.sourceScope : null, value: grace.resolved ? grace.policy.value : null, applied: false, effect: grace.resolved ? `days=${(grace.policy.value as { days?: number }).days ?? "?"} (consumed at Posting, not here)` : "no grace policy" },
        { policyType: "posting_review", scope: reviewPolicy.resolved ? reviewPolicy.sourceScope : null, value: reviewPolicy.resolved ? reviewPolicy.policy.value : null, applied: reviewByPolicy, effect: reviewByPolicy ? "obligations flagged review_required" : "no review required" },
    ];

    const obligations: ResolvedObligationIntent[] = [];
    const commercialObjectsUsed: CommercialObjectRef[] = [];
    const eventTypeCache = new Map<string, ConsumptionEventTypeRow | null>();
    let primaryChargePreview: ChargePreviewResult | null = null;
    let primaryTemplate: ChargeTemplateRow | null = null;

    for (const directive of interpretation.directives) {
        const rate: RateResolution | null = directive.scheduleBasis
            ? resolveRate({ plans, rules, context: { siteLocationId: scope.siteLocationId, ageGroupKey: scope.ageGroupKey, scheduleBasis: directive.scheduleBasis as ScheduleBasis, planKey: fact.ratePlanKey }, dateYmd: periodStart })
            : null;
        if (rate?.resolved) {
            commercialObjectsUsed.push({ kind: "rate_plan", label: rate.plan.label ?? rate.plan.plan_key, detail: `${rate.plan.scope_type} · ${rate.calculationStrategy}`, matched: true });
            commercialObjectsUsed.push({ kind: "rate_rule", label: `${rate.scheduleBasis} @ ${rate.rateBasis}`, detail: `${rate.amountCents}¢ ${rate.currencyCode}`, matched: true });
        } else if (directive.scheduleBasis) {
            commercialObjectsUsed.push({ kind: "rate_rule", label: directive.scheduleBasis, detail: rate ? `unresolved: ${(rate as { reason: string }).reason}` : "no rate", matched: false });
        }
        const rateAmount = rate?.resolved ? rate.amountCents : null;
        const currency = rate?.resolved ? rate.currencyCode : "USD";

        if (directive.draftable) {
            if (!eventTypeCache.has(directive.eventKey)) eventTypeCache.set(directive.eventKey, await loadEventType(supabase, orgId, directive.eventKey));
            const dEventType = eventTypeCache.get(directive.eventKey) ?? null;
            const template = await loadTemplateByKey(supabase, orgId, dEventType?.charge_template_key ?? null);
            if (template && rateAmount != null) {
                const cp = await previewTemplateCharge(supabase, orgId, scheduleSimulateArgs(fact, template, rateAmount, periodStart, today));
                if (!primaryChargePreview) { primaryChargePreview = cp; primaryTemplate = template; }
                commercialObjectsUsed.push({ kind: "charge_template", label: template.label, detail: `${template.template_key} · ${template.amount_strategy}`, matched: true });
                obligations.push({
                    obligationKind: directive.obligationKind,
                    chargeTemplateId: cp.intent.templateId,
                    serviceId: cp.intent.serviceId,
                    amountCents: cp.intent.amountCents,
                    currencyCode: cp.intent.currencyCode,
                    responsibilityKey: cp.intent.responsibilityKey ?? dEventType?.default_responsibility_key ?? "household",
                    occursOn: cp.intent.occursOn,
                    billableOn: cp.intent.billableOn,
                    periodStart: directive.obligationKind === "recurring_tuition" ? periodStart : null,
                    periodEnd: fact.periodEnd ?? null,
                    reviewRequired: cp.intent.reviewRequired,
                    draftable: true,
                    status: "previewed",
                    resolutionKey: cp.intent.resolutionKey,
                    explanation: { directive_reason: directive.reason, charge_template_key: cp.intent.templateKey, amount_strategy: cp.intent.amountStrategy, lifecycle_status: cp.intent.lifecycleStatus, rate_amount_cents: rateAmount },
                });
            } else {
                obligations.push(noChargeObligation(directive, rateAmount == null ? "no rate rule matched the schedule basis" : "no charge template configured for this event", periodStart, fact, agreementId, currency));
            }
        } else {
            // proration / proration_credit — preview-only obligation (credits post downstream).
            const method = proration.resolved ? (proration.policy.value as { method?: string }).method ?? "none" : "none";
            const amount = prorateAmountCents(rateAmount, fact.proratedDays, fact.periodDays);
            obligations.push({
                obligationKind: directive.obligationKind,
                chargeTemplateId: null,
                serviceId: null,
                amountCents: amount,
                currencyCode: currency,
                responsibilityKey: "household",
                occursOn: periodStart,
                billableOn: periodStart,
                periodStart,
                periodEnd: fact.periodEnd ?? null,
                reviewRequired: reviewByPolicy,
                draftable: false,
                status: amount != null ? "previewed" : "no_charge",
                resolutionKey: `cons:${directive.obligationKind}:${periodStart}:${agreementId ?? fact.sourceEntityId}`,
                explanation: { directive_reason: directive.reason, proration_method: method, prorated_days: fact.proratedDays ?? null, period_days: fact.periodDays ?? null, full_period_amount_cents: rateAmount, note: "preview only; the adjustment/credit posts downstream" },
            });
        }
    }

    const primaryDirective = interpretation.directives.find((d) => d.draftable) ?? interpretation.directives[0] ?? null;
    const primaryEventKey = primaryDirective?.eventKey ?? `schedule.${interpretation.scheduleChangeKind}`;
    if (primaryDirective && !eventTypeCache.has(primaryDirective.eventKey)) {
        eventTypeCache.set(primaryDirective.eventKey, await loadEventType(supabase, orgId, primaryDirective.eventKey));
    }
    const primaryEventType = primaryDirective ? eventTypeCache.get(primaryDirective.eventKey) ?? null : null;

    const occursOn = primaryDirective?.obligationKind === "drop_in" || primaryDirective?.obligationKind === "extra_day"
        ? fact.eventDate ?? fact.occursOn ?? today
        : periodStart;
    const event: ConsumptionEventIntent = {
        eventTypeId: primaryEventType?.id ?? null,
        sourceFamily: "schedule",
        eventKey: primaryEventKey,
        sourceEntityType: fact.sourceEntityType,
        sourceEntityId: fact.sourceEntityId,
        subjectType: fact.subjectType ?? null,
        subjectId: fact.subjectId ?? null,
        locationId: fact.locationId ?? scope.siteLocationId ?? null,
        occursOn,
        effectiveOn: fact.effectiveOn ?? null,
        status: obligations.length > 0 ? "resolved" : "no_obligation",
        context: { ...(fact.context ?? {}), source_family: "schedule", schedule_change_kind: interpretation.scheduleChangeKind, schedule_basis: derivedBasis ?? fact.scheduleBasis ?? null, weekdays: fact.weekdays ?? null, no_impact_reason: interpretation.noImpactReason },
        idempotencyKey: fact.idempotencyKey?.trim() || `cev:schedule:${interpretation.scheduleChangeKind}:${agreementId ?? fact.sourceEntityId}:${occursOn}`,
    };

    const resolution: ConsumptionResolution = {
        event,
        obligations,
        explanation: {
            schedule_change_kind: interpretation.scheduleChangeKind,
            no_impact_reason: interpretation.noImpactReason,
            directive_count: interpretation.directives.length,
            obligation_count: obligations.length,
            agreement_status: scope.agreementStatus,
            cadence: cadence.resolved ? (cadence.policy.value as { cadence?: string }).cadence ?? null : null,
        },
    };

    const matchedCommercial: MatchedCommercial | null = primaryTemplate
        ? { chargeTemplateId: primaryTemplate.id, chargeTemplateKey: primaryTemplate.template_key, chargeTemplateLabel: primaryTemplate.label, serviceId: primaryTemplate.service_id }
        : null;

    return {
        fact,
        eventType: primaryEventType ? eventTypeSummary(primaryEventType, orgId) : null,
        matchedCommercial,
        resolution,
        chargePreview: primaryChargePreview,
        interpretation,
        commercialObjectsUsed,
        policiesApplied,
    };
}

function noChargeObligation(directive: ConsumptionDirective, reason: string, periodStart: string, fact: OperationalFactDto, agreementId: string | null, currency: string): ResolvedObligationIntent {
    return {
        obligationKind: directive.obligationKind,
        chargeTemplateId: null,
        serviceId: null,
        amountCents: null,
        currencyCode: currency,
        responsibilityKey: "household",
        occursOn: periodStart,
        billableOn: periodStart,
        periodStart: directive.obligationKind === "recurring_tuition" ? periodStart : null,
        periodEnd: fact.periodEnd ?? null,
        reviewRequired: false,
        draftable: false,
        status: "no_charge",
        resolutionKey: `cons:${directive.obligationKind}:${periodStart}:${agreementId ?? fact.sourceEntityId}`,
        explanation: { directive_reason: directive.reason, no_charge_reason: reason },
    };
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
        obligation_kind: obligation.obligationKind,
        period_start: obligation.periodStart,
        period_end: obligation.periodEnd,
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
                obligation_kind: row.obligation_kind,
                period_start: row.period_start,
                period_end: row.period_end,
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

    const agreementId = agreementIdFromFact(fact);
    const resolvedObligationIds: string[] = [];
    const drafted: { obligationKind: ObligationKind; draftChargeId: string | null; draftChargeStatus: string | null }[] = [];
    let firstDraftChargeId: string | null = null;
    let firstDraftChargeStatus: string | null = null;

    // Draft a charge PER obligation through the EXISTING lifecycle service. A
    // non-draftable obligation (e.g. a proration credit) persists as a preview only.
    for (const obligation of preview.resolution.obligations) {
        let draftChargeId: string | null = null;
        let draftChargeStatus: string | null = null;

        if (obligation.draftable && obligation.chargeTemplateId && agreementId && obligation.amountCents != null && obligation.amountCents > 0) {
            const result = await writeTemplateDraftCharge(supabase, orgId, {
                templateId: obligation.chargeTemplateId,
                agreementId,
                resolvedAmountCents: obligation.amountCents,
                servicePeriodStart: obligation.periodStart,
                eventDate: obligation.occursOn,
                today,
                actorUserId,
            });
            draftChargeStatus = result.status;
            if (result.status === "created" || result.status === "recalculated" || result.status === "unchanged") {
                draftChargeId = result.chargeId;
            }
            // skipped_posted / not_writable => leave draftChargeId null (never link a posted charge).
        }

        const status: ResolvedObligationIntent["status"] = draftChargeId ? "drafted" : obligation.status;
        const id = await upsertObligation(supabase, orgId, consumptionEventId, obligation, draftChargeId, status, actorUserId);
        resolvedObligationIds.push(id);
        drafted.push({ obligationKind: obligation.obligationKind, draftChargeId, draftChargeStatus });
        if (firstDraftChargeId == null && draftChargeId != null) {
            firstDraftChargeId = draftChargeId;
            firstDraftChargeStatus = draftChargeStatus;
        }
    }

    return {
        ...preview,
        persisted: {
            consumptionEventId,
            resolvedObligationIds,
            draftChargeId: firstDraftChargeId,
            draftChargeStatus: firstDraftChargeStatus ?? (drafted[0]?.draftChargeStatus ?? null),
            obligations: drafted,
        },
    };
}
