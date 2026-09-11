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
import { valueVacationCredit, type VacationCreditValuation } from "@/lib/operationalConsumption/vacationCreditValuation";
import { applyVacationCreditReduction } from "@/lib/financials/reductions/policyReductionService";
import type { VacationTreatment } from "@/lib/financials/policies/financialPolicyTypes";
import type { ChildcareRatePlanRow, ChildcareRateRuleRow } from "@/lib/financials/rates/rateTypes";
// Phase 9 — Billing prices tuition from Commercial Execution (frozen V1), not Substrate A.
import { composeCommercialExport } from "@/lib/commercial/execution/export";
import { getCommercialTuitionValuation } from "@/lib/commercial/execution/billing";
import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
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
import { interpretAttendance, type AttendanceInterpretation } from "@/lib/operationalConsumption/attendanceInterpretation";
import { buildFactSnapshot } from "@/lib/operationalConsumption/consumptionTypes";
import { factAnchorSuffix, correctionLineageContext } from "@/lib/operationalConsumption/resolveConsumption";
import {
    reconcileConsumptionCorrection,
} from "@/lib/operationalConsumption/reconcileConsumptionCorrectionAtomicCommit";
import { buildDraftChargeRetirementIntent, buildChildcareDraftChargeFields, createChildcareCorrection } from "@/lib/financials/childcareChargeService";
import type {
    ConsumptionCandidate,
    ConsumptionEventIntent,
    ConsumptionEventTypeRow,
    ConsumptionSupersededResult,
    ConsumptionSupersessionDelta,
    ObligationKind,
    OperationalFactDto,
    ReconcileChargePlan,
    ReconcileConsumptionPlan,
    ReconcileObligationPlan,
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
    // --- Slice 3 (Consumption Pipeline) ---
    /** The normalized Consumption Candidate this fact entered the pipeline as. */
    candidate?: ConsumptionCandidate | null;
    /** The attendance interpretation (null for non-attendance facts). */
    attendanceInterpretation?: AttendanceInterpretation | null;
    // --- Wave 1 (D12a) ---
    /**
     * For a correction/reversal fact: which prior obligations it WOULD retire
     * (read-only delta; writes nothing). Null for originals. (Section 5.3.)
     */
    supersession?: ConsumptionSupersessionDelta | null;
};

/** A Commercial Model object surfaced in the explanation (labels, not raw UUIDs). */
export type CommercialObjectRef = {
    kind: "rate_plan" | "rate_rule" | "charge_template" | "service" | "commercial_rate" | "accepted_pricing_term";
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
    /**
     * For a correction/reversal fact: the reconciliation outcome (retired/reparented
     * obligations + voided draft charges). Null for originals. (Section 5.4.)
     */
    superseded?: ConsumptionSupersededResult | null;
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

/** Map a fact to the agreement that scopes/bills it. Attendance facts carry an explicit agreementId. */
function agreementIdFromFact(fact: OperationalFactDto): string | null {
    if (fact.agreementId) return fact.agreementId;
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

/** An attendance fact (by family, attendance fact type, or event-key prefix). */
function isAttendanceFact(fact: OperationalFactDto): boolean {
    return (
        fact.sourceFamily === "attendance" ||
        fact.attendanceFactType != null ||
        (typeof fact.eventKey === "string" && fact.eventKey.startsWith("attendance."))
    );
}

/** Normalize a fact into a Consumption Candidate (the pipeline's entry shape). Pure. */
function buildCandidate(fact: OperationalFactDto, today: string): ConsumptionCandidate {
    const domain = isAttendanceFact(fact) ? "attendance" : isScheduleFact(fact) ? "schedule" : "agreement";
    const factType =
        domain === "attendance"
            ? fact.attendanceFactType ?? "check_out"
            : domain === "schedule"
              ? fact.scheduleChangeKind ?? "recurring"
              : fact.eventKey || "agreement";
    return {
        domain,
        factType,
        sourceEntityType: fact.sourceEntityType,
        sourceEntityId: fact.sourceEntityId,
        subjectType: fact.subjectType ?? null,
        subjectId: fact.subjectId ?? null,
        locationId: fact.locationId ?? null,
        occursOn: fact.occursOn ?? fact.eventDate ?? today,
        agreementId: agreementIdFromFact(fact),
        attributes: {
            check_in_time: fact.checkInTime ?? null,
            check_out_time: fact.checkOutTime ?? null,
            late_threshold_time: fact.lateThresholdTime ?? null,
            hours: fact.hours ?? null,
            schedule_basis: fact.scheduleBasis ?? null,
        },
    };
}

/**
 * Public preview: resolve the fact (core) then, for a correction/reversal, attach
 * the read-only supersession delta. Writes NOTHING. Originals are byte-behavior
 * unchanged (supersession is null, an added optional field). (Section 5.3.)
 */
export async function previewConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    const preview = await previewConsumptionCore(supabase, orgId, fact, today);
    const supersession = await computeSupersessionDelta(supabase, orgId, fact, preview);
    return { ...preview, supersession };
}

async function previewConsumptionCore(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    if (!fact.sourceEntityId?.trim()) fail("invalid_input", "source_entity_id is required");
    if (isAttendanceFact(fact)) return previewAttendanceConsumption(supabase, orgId, fact, today);
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
        candidate: buildCandidate(fact, today),
        attendanceInterpretation: null,
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
const PLACEMENTS_TABLE = "child_placements";
const PROGRAM_CATEGORIES_TABLE = "location_program_categories";

/** Cadence keys Commercial tuition rates are keyed by. */
const COMMERCIAL_CADENCE_KEYS = new Set(["monthly", "weekly", "biweekly", "annual", "daily", "hourly", "per_session"]);
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

/**
 * Phase 9 — resolve the enrollment's Commercial program_key from existing data:
 * agreement → child_placements.program_category_id → location_program_categories.key.
 * No schema change. Returns null when there is no placement/program (Commercial then
 * surfaces `no_offering_for_program`, never a Substrate-A fallback).
 */
async function resolveProgramKey(supabase: SupabaseClient, orgId: string, agreementId: string | null): Promise<string | null> {
    if (!agreementId) return null;
    const { data: placements, error: pErr } = await supabase
        .from(PLACEMENTS_TABLE)
        .select("program_category_id, start_date")
        .eq("org_id", orgId)
        .eq("enrollment_agreement_id", agreementId)
        .order("start_date", { ascending: false })
        .limit(1);
    if (pErr) fail("db_error", pErr.message);
    const programCategoryId = ((placements ?? []) as { program_category_id?: string | null }[])[0]?.program_category_id ?? null;
    if (!programCategoryId) return null;
    const { data: cat, error: cErr } = await supabase
        .from(PROGRAM_CATEGORIES_TABLE)
        .select("key")
        .eq("org_id", orgId)
        .eq("id", programCategoryId)
        .maybeSingle();
    if (cErr) fail("db_error", cErr.message);
    return (cat as { key?: string } | null)?.key ?? null;
}

/**
 * Phase 9 — load the Commercial Execution pricing inputs once per preview: the
 * Commercial Export (frozen V1) + the enrollment's program_key + the recurring
 * cadence. Shared by schedule + attendance previews.
 */
async function loadCommercialPricingInputs(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string | null,
    asOf: string,
    billingCadence: string | null,
): Promise<{ commercialExport: CommercialExport; programKey: string | null; cadenceKey: string }> {
    const [{ export: commercialExport }, programKey] = await Promise.all([
        composeCommercialExport({ supabase, orgId, asOf }),
        resolveProgramKey(supabase, orgId, agreementId),
    ]);
    const cadenceKey = billingCadence && COMMERCIAL_CADENCE_KEYS.has(billingCadence) ? billingCadence : "monthly";
    return { commercialExport, programKey, cadenceKey };
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

    const billingCadence = cadence.resolved ? String((cadence.policy.value as { cadence?: string }).cadence ?? "") : null;
    const pricing = await loadCommercialPricingInputs(supabase, orgId, agreementId, periodStart, billingCadence);
    const eventTypeCache = new Map<string, ConsumptionEventTypeRow | null>();
    const ctx: DirectiveCtx = {
        scope,
        plans,
        rules,
        today,
        periodStart,
        anchorDate: periodStart,
        agreementId,
        reviewByPolicy,
        prorationMethod: proration.resolved ? (proration.policy.value as { method?: string }).method ?? "none" : "none",
        fact,
        eventTypeCache,
        commercialExport: pricing.commercialExport,
        programKey: pricing.programKey,
        cadenceKey: pricing.cadenceKey,
    };
    const obligations: ResolvedObligationIntent[] = [];
    const commercialObjectsUsed: CommercialObjectRef[] = [];
    let primaryChargePreview: ChargePreviewResult | null = null;
    let primaryTemplate: ChargeTemplateRow | null = null;
    for (const directive of interpretation.directives) {
        const r = await resolveDirective(supabase, orgId, directive, ctx);
        obligations.push(r.obligation);
        commercialObjectsUsed.push(...r.commercialRefs);
        if (!primaryChargePreview && r.chargePreview) {
            primaryChargePreview = r.chargePreview;
            primaryTemplate = r.template;
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
        context: { ...(fact.context ?? {}), source_family: "schedule", schedule_change_kind: interpretation.scheduleChangeKind, schedule_basis: derivedBasis ?? fact.scheduleBasis ?? null, weekdays: fact.weekdays ?? null, no_impact_reason: interpretation.noImpactReason, ...correctionLineageContext(fact), fact_snapshot: buildFactSnapshot(fact) },
        idempotencyKey: fact.idempotencyKey?.trim() || `cev:schedule:${interpretation.scheduleChangeKind}:${agreementId ?? fact.sourceEntityId}:${occursOn}${factAnchorSuffix(fact)}`,
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
        candidate: buildCandidate(fact, today),
        attendanceInterpretation: null,
    };
}

/**
 * Attendance consumption (Slice 3). Attendance is the first consumer of the
 * canonical pipeline: Operational Fact → Candidate → (interpret) → Consumption
 * Event(s) → Commercial Resolution → Resolved Obligation → Draft Charge. Not every
 * attendance fact becomes an event; discarded candidates explain why. No write.
 */
async function previewAttendanceConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
): Promise<ConsumptionPreviewResult> {
    const candidate = buildCandidate(fact, today);
    const agreementId = agreementIdFromFact(fact);
    const scope = await resolveAgreementScope(supabase, orgId, fact, agreementId);

    const plans = await listRows<ChildcareRatePlanRow>(supabase, RATE_PLANS_TABLE, orgId);
    const rules = await listRows<ChildcareRateRuleRow>(supabase, RATE_RULES_TABLE, orgId);
    const policies = await listFinancialPolicies(supabase, orgId);

    const anchorDate = fact.occursOn ?? fact.eventDate ?? today;
    const periodStart = fact.periodStart ?? firstOfMonth(anchorDate);
    const policyCtx = { locationId: scope.siteLocationId ?? undefined, serviceId: undefined, ratePlanId: undefined };

    /*
     * POLICY IS RESOLVED BEFORE INTERPRETATION, because interpretation now needs
     * it. `vacation_credit` goes through the ordinary scope hierarchy — org,
     * location, service, rate plan, most-specific-wins, effective-dated — with no
     * attendance-specific precedence of its own. The interpreter stays pure; the
     * commercial answer is handed to it.
     */
    const vacationPolicy = resolveFinancialPolicy(policies, "vacation_credit", policyCtx, anchorDate);
    const vacationTreatment = vacationPolicy.resolved
        ? ((vacationPolicy.policy.value as { treatment?: VacationTreatment }).treatment ?? null)
        : null;
    const interpretation = interpretAttendance(fact, { vacationTreatment });

    const proration = resolveFinancialPolicy(policies, "proration", policyCtx, anchorDate);
    const reviewPolicy = resolveFinancialPolicy(policies, "posting_review", policyCtx, anchorDate);
    const reviewByPolicy = reviewPolicy.resolved ? reviewPolicy.policy.value.required === true : false;

    const hasVacationCredit = interpretation.directives.some((d) => d.obligationKind === "vacation_credit");
    const policiesApplied: PolicyApplication[] = [
        { policyType: "posting_review", scope: reviewPolicy.resolved ? reviewPolicy.sourceScope : null, value: reviewPolicy.resolved ? reviewPolicy.policy.value : null, applied: reviewByPolicy, effect: reviewByPolicy ? "obligations flagged review_required" : "no review required" },
        /*
         * The REAL resolved policy, with its scope, replacing a synthetic entry
         * that reported `scope: null` and a value read off the fact. The lineage
         * an auditor reads must name the policy that actually decided.
         */
        {
            policyType: "vacation_credit",
            scope: vacationPolicy.resolved ? vacationPolicy.sourceScope : null,
            value: vacationPolicy.resolved ? vacationPolicy.policy.value : null,
            applied: hasVacationCredit,
            effect: vacationTreatment === "credit"
                ? "vacation policy = credit → absence earns a vacation credit"
                : vacationTreatment === "no_credit"
                  ? "vacation policy = no_credit → no credit"
                  : "no vacation_credit policy configured → no automatic credit",
        },
        { policyType: "proration", scope: proration.resolved ? proration.sourceScope : null, value: proration.resolved ? proration.policy.value : null, applied: hasVacationCredit, effect: proration.resolved ? `method=${(proration.policy.value as { method?: string }).method ?? "?"}` : "no proration policy (default none)" },
    ];

    const pricing = await loadCommercialPricingInputs(supabase, orgId, agreementId, anchorDate, null);
    const eventTypeCache = new Map<string, ConsumptionEventTypeRow | null>();
    const ctx: DirectiveCtx = {
        scope,
        plans,
        rules,
        today,
        periodStart,
        anchorDate,
        agreementId,
        reviewByPolicy,
        prorationMethod: proration.resolved ? (proration.policy.value as { method?: string }).method ?? "none" : "none",
        fact,
        eventTypeCache,
        commercialExport: pricing.commercialExport,
        programKey: pricing.programKey,
        cadenceKey: pricing.cadenceKey,
        // The policy that decided, carried down so the obligation can name its authority.
        vacationPolicyId: vacationPolicy.resolved ? vacationPolicy.policy.id : null,
        vacationPolicySnapshot: vacationPolicy.resolved
            ? { value: vacationPolicy.policy.value, scope: vacationPolicy.sourceScope }
            : null,
    };

    const obligations: ResolvedObligationIntent[] = [];
    const commercialObjectsUsed: CommercialObjectRef[] = [];
    let primaryChargePreview: ChargePreviewResult | null = null;
    let primaryTemplate: ChargeTemplateRow | null = null;
    for (const directive of interpretation.directives) {
        const r = await resolveDirective(supabase, orgId, directive, ctx);
        obligations.push(r.obligation);
        commercialObjectsUsed.push(...r.commercialRefs);
        if (!primaryChargePreview && r.chargePreview) {
            primaryChargePreview = r.chargePreview;
            primaryTemplate = r.template;
        }
    }

    const primaryDirective = interpretation.directives.find((d) => d.draftable) ?? interpretation.directives[0] ?? null;
    const primaryEventKey = primaryDirective?.eventKey ?? `attendance.${interpretation.attendanceFactType}`;
    if (primaryDirective && !eventTypeCache.has(primaryDirective.eventKey)) {
        eventTypeCache.set(primaryDirective.eventKey, await loadEventType(supabase, orgId, primaryDirective.eventKey));
    }
    const primaryEventType = primaryDirective ? eventTypeCache.get(primaryDirective.eventKey) ?? null : null;

    const event: ConsumptionEventIntent = {
        eventTypeId: primaryEventType?.id ?? null,
        sourceFamily: "attendance",
        eventKey: primaryEventKey,
        sourceEntityType: fact.sourceEntityType,
        sourceEntityId: fact.sourceEntityId,
        subjectType: fact.subjectType ?? null,
        subjectId: fact.subjectId ?? null,
        locationId: fact.locationId ?? scope.siteLocationId ?? null,
        occursOn: anchorDate,
        effectiveOn: fact.effectiveOn ?? null,
        status: obligations.length > 0 ? "resolved" : "no_obligation",
        context: { ...(fact.context ?? {}), source_family: "attendance", attendance_fact_type: interpretation.attendanceFactType, discard_reason: interpretation.discardReason, check_out_time: fact.checkOutTime ?? null, late_threshold_time: fact.lateThresholdTime ?? null, ...correctionLineageContext(fact), fact_snapshot: buildFactSnapshot(fact) },
        idempotencyKey: fact.idempotencyKey?.trim() || `cev:attendance:${interpretation.attendanceFactType}:${agreementId ?? fact.sourceEntityId}:${anchorDate}${factAnchorSuffix(fact)}`,
    };

    const resolution: ConsumptionResolution = {
        event,
        obligations,
        explanation: {
            attendance_fact_type: interpretation.attendanceFactType,
            discard_reason: interpretation.discardReason,
            candidate_discarded: interpretation.directives.length === 0,
            directive_count: interpretation.directives.length,
            obligation_count: obligations.length,
            suppressed_obligation_count: obligations.filter((o) => o.status === "no_charge").length,
            agreement_status: scope.agreementStatus,
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
        interpretation: null,
        commercialObjectsUsed,
        policiesApplied,
        candidate,
        attendanceInterpretation: interpretation,
    };
}

/** Obligation kinds that carry a service period (vs. an event-dated one-off). */
const PERIOD_KINDS = new Set(["recurring_tuition", "proration", "proration_credit", "vacation_credit"]);

type DirectiveCtx = {
    scope: AgreementScope;
    plans: ChildcareRatePlanRow[];
    rules: ChildcareRateRuleRow[];
    today: string;
    /** Service-period anchor (schedule). */
    periodStart: string;
    /** Date this obligation anchors to when it is not a draftable charge (schedule: period; attendance: event date). */
    anchorDate: string;
    agreementId: string | null;
    reviewByPolicy: boolean;
    prorationMethod: string;
    fact: OperationalFactDto;
    eventTypeCache: Map<string, ConsumptionEventTypeRow | null>;
    // Phase 9 — Commercial Execution pricing inputs.
    commercialExport: CommercialExport | null;
    programKey: string | null;
    /** Recurring billing cadence for tuition rate selection (mapped from policy; default monthly). */
    cadenceKey: string;
    /** The resolved `vacation_credit` financial policy, when the attendance path resolved one. */
    vacationPolicyId?: string | null;
    vacationPolicySnapshot?: Record<string, unknown> | null;
};

type DirectiveResolution = {
    obligation: ResolvedObligationIntent;
    chargePreview: ChargePreviewResult | null;
    template: ChargeTemplateRow | null;
    commercialRefs: CommercialObjectRef[];
};

function noChargeObligation(directive: ConsumptionDirective, reason: string, ctx: DirectiveCtx, currency: string): ResolvedObligationIntent {
    const periodStart = PERIOD_KINDS.has(directive.obligationKind) ? ctx.periodStart : null;
    return {
        obligationKind: directive.obligationKind,
        chargeTemplateId: null,
        serviceId: null,
        amountCents: null,
        currencyCode: currency,
        responsibilityKey: "household",
        occursOn: ctx.anchorDate,
        billableOn: ctx.anchorDate,
        periodStart,
        periodEnd: ctx.fact.periodEnd ?? null,
        reviewRequired: false,
        draftable: false,
        status: "no_charge",
        resolutionKey: `cons:${directive.obligationKind}:${ctx.anchorDate}:${ctx.agreementId ?? ctx.fact.sourceEntityId}`,
        explanation: { directive_reason: directive.reason, no_charge_reason: reason },
    };
}

/**
 * Resolve ONE directive into an obligation through the Commercial Model — the
 * shared core of the Consumption Pipeline used by every domain (schedule,
 * attendance, …). Handles rate-derived AND fixed-fee templates, an hourly
 * unit multiplier, and preview-only (non-draftable) credits. Consumes the
 * existing Rate Resolution + Charge Template resolver; never reimplements pricing.
 */
async function resolveDirective(
    supabase: SupabaseClient,
    orgId: string,
    directive: ConsumptionDirective,
    ctx: DirectiveCtx,
): Promise<DirectiveResolution> {
    const { fact } = ctx;
    const commercialRefs: CommercialObjectRef[] = [];
    // Phase 9 — price tuition from Commercial Execution (frozen V1), not Substrate A.
    // No fallback: when Commercial can't resolve, rateAmount stays null and the
    // obligation surfaces the reason (config gap) instead of a legacy price.
    let rateAmount: number | null = null;
    let currency = "USD";
    let commercialUnresolvedReason: string | null = null;
    /*
     * ── AN ACCEPTED TERM IS THE PRICE, AND THE CATALOG IS NOT CONSULTED ──
     *
     * When the fact was raised from an accepted `enrollment_pricing_terms` row, the amount is the
     * one the family agreed to and the catalog lookup below is SKIPPED ENTIRELY — not consulted and
     * overridden, skipped. Two reasons, and both are correctness rather than tidiness: an accepted
     * term may be an OVERRIDE, deliberately not the recommendation, so re-resolving would bill a
     * rate nobody agreed to; and a catalog edit would otherwise change what an already-agreed family
     * owes next month, which is the drift the accepted term exists to prevent.
     *
     * Facts raised any other way are untouched and still price from Commercial Execution.
     */
    const accepted = fact.acceptedPricing ?? null;
    if (accepted) {
        rateAmount = accepted.amountCents;
        currency = accepted.currencyCode;
        commercialRefs.push({
            kind: "accepted_pricing_term",
            label: `term ${accepted.termId}`,
            detail:
                `${accepted.amountCents}¢ ${accepted.currencyCode} · ${accepted.state} · cadence `
                + `${accepted.cadenceKey} · ${accepted.sourceEntity}:${accepted.sourceId}`
                + `${accepted.configVersion ? ` · config ${accepted.configVersion}` : ""}`,
            matched: true,
        });
    } else if (directive.scheduleBasis) {
        const cadenceKey =
            directive.obligationKind === "drop_in" || directive.obligationKind === "extra_day"
                ? "daily"
                : directive.obligationKind === "hourly_care"
                  ? "hourly"
                  : ctx.cadenceKey;
        if (ctx.commercialExport && ctx.programKey) {
            const val = getCommercialTuitionValuation(ctx.commercialExport, { programKey: ctx.programKey, scheduleBasis: directive.scheduleBasis, locationId: ctx.scope.siteLocationId, asOf: ctx.anchorDate, cadenceKey, payerType: "private_pay" });
            if (val.resolved) {
                rateAmount = val.amountCents;
                currency = val.currencyCode;
                commercialRefs.push({ kind: "commercial_rate", label: `${directive.scheduleBasis} → variant ${val.variantId}`, detail: `${val.amountCents}¢ ${val.currencyCode}${val.policyAdjusted ? " · policy-adjusted" : ""} · cadence ${val.cadenceKey}`, matched: true });
            } else {
                commercialUnresolvedReason = val.reason;
                commercialRefs.push({ kind: "commercial_rate", label: directive.scheduleBasis, detail: `commercial unresolved: ${val.reason}`, matched: false });
            }
        } else {
            commercialUnresolvedReason = ctx.programKey ? "no_commercial_export" : "no_program_key";
            commercialRefs.push({ kind: "commercial_rate", label: directive.scheduleBasis, detail: `commercial unresolved: ${commercialUnresolvedReason}`, matched: false });
        }
    }
    const periodStart = PERIOD_KINDS.has(directive.obligationKind) ? ctx.periodStart : null;

    if (directive.draftable) {
        if (!ctx.eventTypeCache.has(directive.eventKey)) ctx.eventTypeCache.set(directive.eventKey, await loadEventType(supabase, orgId, directive.eventKey));
        const dEventType = ctx.eventTypeCache.get(directive.eventKey) ?? null;
        const template = await loadTemplateByKey(supabase, orgId, dEventType?.charge_template_key ?? null);
        if (!template) {
            return { obligation: noChargeObligation(directive, `no charge template configured for ${directive.eventKey}`, ctx, currency), chargePreview: null, template: null, commercialRefs };
        }
        // rate-derived amount × unit multiplier (e.g. hours); null lets a FIXED template price itself.
        const effectiveAmount = rateAmount != null ? Math.round(rateAmount * (directive.unitMultiplier ?? 1)) : null;
        const cp = await previewTemplateCharge(supabase, orgId, scheduleSimulateArgs(fact, template, effectiveAmount, ctx.periodStart, ctx.today));
        commercialRefs.push({ kind: "charge_template", label: template.label, detail: `${template.template_key} · ${template.amount_strategy}`, matched: true });
        if (cp.intent.eligible && cp.intent.amountCents != null && cp.intent.amountCents > 0) {
            return {
                obligation: {
                    obligationKind: directive.obligationKind,
                    chargeTemplateId: cp.intent.templateId,
                    serviceId: cp.intent.serviceId,
                    amountCents: cp.intent.amountCents,
                    currencyCode: cp.intent.currencyCode,
                    responsibilityKey: cp.intent.responsibilityKey ?? dEventType?.default_responsibility_key ?? "household",
                    occursOn: cp.intent.occursOn,
                    billableOn: cp.intent.billableOn,
                    periodStart,
                    periodEnd: fact.periodEnd ?? null,
                    reviewRequired: cp.intent.reviewRequired,
                    draftable: true,
                    status: "previewed",
                    resolutionKey: cp.intent.resolutionKey,
                    explanation: { directive_reason: directive.reason, charge_template_key: cp.intent.templateKey, amount_strategy: cp.intent.amountStrategy, lifecycle_status: cp.intent.lifecycleStatus, rate_amount_cents: rateAmount, unit_multiplier: directive.unitMultiplier ?? 1 },
                },
                chargePreview: cp,
                template,
                commercialRefs,
            };
        }
        const reason = commercialUnresolvedReason
            ? `commercial pricing unresolved: ${commercialUnresolvedReason}`
            : cp.intent.eligible
              ? "amount not resolvable (no rate / fixed amount)"
              : cp.intent.reason ?? "template ineligible";
        return { obligation: noChargeObligation(directive, reason, ctx, currency), chargePreview: cp, template, commercialRefs };
    }

    // Non-draftable (proration / proration_credit / vacation_credit) — preview only.
    const proratedDays = fact.proratedDays ?? (directive.obligationKind === "vacation_credit" ? 1 : null);

    /*
     * A VACATION CREDIT IS VALUED AGAINST THE TUITION THE FAMILY AGREED TO.
     *
     * `rateAmount` above resolves from an accepted term or from the directive's
     * schedule basis, and a vacation-credit directive carries neither — it has no
     * basis, because it is not pricing a day of care. So the amount came out null
     * whatever the catalog said.
     *
     * The agreed term for the period is the right source: a credit gives back
     * part of what was billed, and deriving it from today's catalog would hand
     * back money against a price nobody agreed to. `valueVacationCredit` reuses
     * the SAME term selection tuition generation performs, so the credit and the
     * charge cannot disagree about which price was in force.
     */
    let vacationValuation: VacationCreditValuation | null = null;
    if (directive.obligationKind === "vacation_credit" && ctx.agreementId) {
        vacationValuation = await valueVacationCredit(supabase, {
            orgId,
            enrollmentAgreementId: ctx.agreementId,
            anchorDate: ctx.anchorDate,
            creditedDays: proratedDays ?? 1,
            prorationMethod: ctx.prorationMethod as Parameters<typeof valueVacationCredit>[1]["prorationMethod"],
        });
    }

    const amount = vacationValuation
        ? (vacationValuation.resolved ? vacationValuation.amountCents : null)
        : prorateAmountCents(rateAmount, proratedDays, fact.periodDays);

    /*
     * A CREDIT THE POLICY GRANTED BUT NOBODY CAN VALUE IS NOT A REFUSAL.
     *
     * Commerce has already said this vacation earns a credit. If the amount will
     * not resolve — no rate for the child's plan, no period length — then the
     * honest state is "owed, and unresolved", not `no_charge`. Reporting it as
     * no_charge would make it indistinguishable from a `no_credit` policy, and the
     * family would quietly not receive money an organisation decided they were
     * due. It fails closed on the money and opens the existing review lifecycle
     * instead, which is where an operator already looks.
     */
    const unresolvedValuation = amount == null;
    return {
        obligation: {
            obligationKind: directive.obligationKind,
            chargeTemplateId: null,
            serviceId: null,
            amountCents: amount,
            currencyCode: currency,
            responsibilityKey: "household",
            occursOn: ctx.anchorDate,
            billableOn: ctx.anchorDate,
            periodStart,
            periodEnd: fact.periodEnd ?? null,
            reviewRequired: ctx.reviewByPolicy || unresolvedValuation,
            draftable: false,
            status: amount != null ? "previewed" : "no_charge",
            resolutionKey: `cons:${directive.obligationKind}:${ctx.anchorDate}:${ctx.agreementId ?? fact.sourceEntityId}`,
            // Which policy decided, carried forward so the reduction can name its authority.
            decidedByFinancialPolicyId: directive.obligationKind === "vacation_credit" ? ctx.vacationPolicyId ?? null : null,
            explanation: {
                directive_reason: directive.reason,
                proration_method: ctx.prorationMethod,
                prorated_days: proratedDays,
                period_days: fact.periodDays ?? null,
                full_period_amount_cents: rateAmount,
                note: "preview only; the adjustment/credit posts downstream",
                ...(vacationValuation?.resolved
                    ? {
                          /*
                           * THE AUDIT ANSWER, structured rather than prose: which
                           * agreed term this credit reduced, and the three numbers
                           * that produced the amount. An operator asked "why this
                           * figure" can reconstruct it without rerunning anything.
                           */
                          accepted_term_id: vacationValuation.termId,
                          accepted_period_amount_cents: vacationValuation.acceptedPeriodAmountCents,
                          period_key: vacationValuation.periodKey,
                          credited_days: vacationValuation.creditedDays,
                          period_days_used: vacationValuation.periodDays,
                      }
                    : {}),
                ...(unresolvedValuation
                    ? {
                          // Named so review reads as a valuation gap, never as a commercial refusal.
                          unresolved_valuation: vacationValuation
                              ? vacationValuation.resolved
                                  ? "unknown"
                                  : vacationValuation.reason
                              : rateAmount == null
                                ? "no_rate_resolved"
                                : "no_period_length",
                          review_reason: "a granted consequence whose amount could not be resolved",
                      }
                    : {}),
            },
        },
        chargePreview: null,
        template: null,
        commercialRefs,
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
    // Seed the pre-posting review lifecycle (Slice 4) explicitly: a review-required
    // obligation starts in review_required, otherwise pending. (The column default
    // alone can't reflect review_required for new rows.) Operator review state is
    // never reset on recalc — it is set on INSERT only.
    const { data, error } = await supabase
        .from(OBLIGATIONS_TABLE)
        .insert({ ...row, review_status: obligation.reviewRequired ? "review_required" : "pending", created_by: actorUserId })
        .select("id")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "obligation insert failed");
    return (data as { id: string }).id;
}

// ============================================================================
// D12a — correction/reversal reconciliation. Plan in TS (read-only), then execute
// ALL writes in ONE atomic RPC (DP-1). The `original` path is unchanged.
// ============================================================================

type PriorEventRow = { id: string; source_family: string | null; source_entity_id: string | null; status: string | null };
type PriorObligationRow = {
    id: string;
    resolution_key: string | null;
    amount_cents: number | null;
    billable_on: string | null;
    draft_charge_id: string | null;
    obligation_kind: string | null;
    status: string | null;
};
type PriorLineage = { priorEvent: PriorEventRow; priorObligations: PriorObligationRow[] };

/** Locate the prior consumption event by (org, source_entity_id = correctsFactId) + its obligations. */
async function locatePriorEvent(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
): Promise<PriorLineage | null> {
    if (!fact.correctsFactId) return null;
    const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .select("id, source_family, source_entity_id, status")
        .eq("org_id", orgId)
        .eq("source_entity_id", fact.correctsFactId);
    if (error) fail("db_error", error.message);
    const events = (data ?? []) as PriorEventRow[];
    const priorEvent =
        events.find((e) => !fact.sourceFamily || e.source_family === fact.sourceFamily) ?? events[0] ?? null;
    if (!priorEvent) return null;
    const { data: obls, error: oErr } = await supabase
        .from(OBLIGATIONS_TABLE)
        .select("id, resolution_key, amount_cents, billable_on, draft_charge_id, obligation_kind, status")
        .eq("org_id", orgId)
        .eq("consumption_event_id", priorEvent.id);
    if (oErr) fail("db_error", oErr.message);
    return { priorEvent, priorObligations: (obls ?? []) as PriorObligationRow[] };
}

/** Pure: the orphan set (prior obligations whose resolution_key is absent from the corrected pass). */
function supersessionFromPrior(preview: ConsumptionPreviewResult, prior: PriorLineage): ConsumptionSupersessionDelta {
    const newKeys = new Set(
        preview.resolution.obligations.map((o) => o.resolutionKey).filter((k): k is string => !!k),
    );
    const orphans = prior.priorObligations.filter((o) => !o.resolution_key || !newKeys.has(o.resolution_key));
    return {
        priorConsumptionEventId: prior.priorEvent.id,
        supersededObligations: orphans.map((o) => ({
            id: o.id,
            resolutionKey: o.resolution_key ?? null,
            obligationKind: o.obligation_kind ?? null,
            priorAmountCents: o.amount_cents ?? null,
        })),
    };
}

/** Read-only supersession delta for `previewConsumption` (null for originals; writes nothing). */
async function computeSupersessionDelta(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    preview: ConsumptionPreviewResult,
): Promise<ConsumptionSupersessionDelta | null> {
    const entryType = fact.entryType ?? "original";
    if (entryType === "original") return null;
    const prior = await locatePriorEvent(supabase, orgId, fact);
    if (!prior) return { priorConsumptionEventId: null, supersededObligations: [] };
    return supersessionFromPrior(preview, prior);
}

/**
 * Load the CURRENT obligation for a resolution_key GLOBALLY (unique per org) — the
 * same lookup the RPC's upsert uses. The planner must decide create-vs-recalc and
 * stale-drift against the live obligation, which may already have been reparented
 * onto another correction event (DP-4 convergence), not only the immediate prior
 * event's obligations.
 */
async function loadObligationByResolutionKey(
    supabase: SupabaseClient,
    orgId: string,
    resolutionKey: string,
): Promise<{ draft_charge_id: string | null; amount_cents: number | null; billable_on: string | null } | null> {
    const { data, error } = await supabase
        .from(OBLIGATIONS_TABLE)
        .select("id, draft_charge_id, amount_cents, billable_on")
        .eq("org_id", orgId)
        .eq("resolution_key", resolutionKey);
    if (error) fail("db_error", error.message);
    return (((data ?? []) as { draft_charge_id: string | null; amount_cents: number | null; billable_on: string | null }[])[0]) ?? null;
}

/**
 * Build the PRICED draft-charge fields for one obligation (financials-owned shape).
 * No write, no create-vs-recalc decision here: which charge the reconciliation touches
 * is decided by the RPC UNDER LOCK from the obligation's own draft_charge_id (audit F1).
 * Charge semantics (the billable-source dimension, category, provenance metadata) are
 * owned by childcareChargeService.buildChildcareDraftChargeFields (audit F2).
 */
async function buildChargePlanForObligation(
    supabase: SupabaseClient,
    orgId: string,
    obligation: ResolvedObligationIntent,
    agreementId: string | null,
    today: string,
): Promise<ReconcileChargePlan | null> {
    if (
        !(
            obligation.draftable &&
            obligation.chargeTemplateId &&
            agreementId &&
            obligation.amountCents != null &&
            obligation.amountCents > 0 &&
            obligation.status !== "no_charge"
        )
    ) {
        return null;
    }
    const cp = await previewTemplateCharge(supabase, orgId, {
        templateId: obligation.chargeTemplateId,
        agreementId,
        resolvedAmountCents: obligation.amountCents,
        servicePeriodStart: obligation.periodStart ?? undefined,
        eventDate: obligation.occursOn ?? undefined,
        today,
    });
    const intent = cp.intent;
    if (!intent.eligible || intent.amountCents == null || intent.amountCents <= 0) return null;
    return buildChildcareDraftChargeFields(intent, agreementId);
}

/** Build the full reconciliation plan (correction event + reparent/supersede/retire). No write. */
/**
 * POSTED MONEY IS NOT RETIRED. IT IS ANSWERED.
 *
 * The reconciliation RPC retires a superseded obligation's draft consequences in place, and
 * reports zero rows for anything settled — which is exactly right, and exactly not enough. Measured
 * on the certification stack: a vacation credit posted at minus thirty-eight seventy-one, an
 * Attendance correction saying the child attended, and afterwards the posted charge correctly
 * untouched and NOTHING compensating it. The family kept a credit for a day their child was in
 * care, and no artifact anywhere said otherwise.
 *
 * Posted protection existed. The compensating primitive existed — `createChildcareCorrection`,
 * which Financials already uses to answer posted money by appending its reversal. What did not
 * exist was the seam between them: nothing turned "this obligation is superseded" into "so its
 * posted money needs answering".
 *
 * This is that seam and nothing more. Attendance supplies the reason the money is wrong;
 * Financials supplies the mechanism and owns the shape of the answer. No second correction engine,
 * no vacation-specific reversal, no rewriting of what was posted.
 *
 * IDEMPOTENT BY THE OWNER'S OWN RULE. `createChildcareCorrection` refuses a second reversal of a
 * charge already reversed, because a second one would credit the family twice. A replayed
 * correction therefore meets that refusal rather than compounding, and the refusal is read here as
 * "already answered" instead of being raised at a caller who did nothing wrong.
 */
/**
 * WHICH OBLIGATIONS CURRENTLY OWE MONEY, AND THE ONE WRITER THAT ANSWERS THEM.
 *
 * Deliberately not `restoreVacationCredit`. Restoration is not a different act from the original —
 * it is the same question asked again after the truth moved, and giving it its own function would
 * be the start of the second engine this thread has spent its length avoiding. Both the original
 * path and the correction path arrive here with the same inputs and get the same answer.
 *
 * ELIGIBILITY IS READ, NEVER DECIDED. The commercial decision already happened: interpretation
 * resolved the policy, the obligation carries its amount and the policy that authorised it, and an
 * unresolvable valuation has already been routed to review as `no_charge` with a named reason.
 * This only asks whether that decision currently stands. Adding any judgement here would move
 * commerce into the correction orchestrator, where nobody would think to look for it.
 */
async function materializeCurrentFinancialConsequences(
    supabase: SupabaseClient,
    orgId: string,
    args: {
        obligations: Array<{ persistedId: string; intent: ResolvedObligationIntent }>;
        consumptionEventId: string;
        agreementId: string | null;
        today: string;
        actorUserId: string | null;
    },
): Promise<void> {
    if (!args.agreementId) return;
    for (const { persistedId, intent } of args.obligations) {
        if (intent.obligationKind !== "vacation_credit") continue;
        if (intent.status !== "previewed") continue;
        if (intent.amountCents == null || intent.amountCents <= 0) continue;
        if (!intent.decidedByFinancialPolicyId) continue;
        if ("unresolved_valuation" in (intent.explanation ?? {})) continue;

        const audit = intent.explanation as Record<string, unknown>;
        await applyVacationCreditReduction(supabase, {
            orgId,
            actorUserId: args.actorUserId,
            resolvedObligationId: persistedId,
            // The event under which this obligation is financially current. A correction that
            // reinstates it reparents it to a new one, and that is what makes the restored
            // consequence a new consequence rather than a revival of a settled one.
            materializingEventId: args.consumptionEventId,
            financialPolicyId: intent.decidedByFinancialPolicyId,
            enrollmentAgreementId: args.agreementId,
            amountCents: intent.amountCents,
            currencyCode: intent.currencyCode,
            effectiveDate: intent.occursOn ?? args.today,
            periodKey: typeof audit.period_key === "string"
                ? audit.period_key
                : (intent.periodStart ?? intent.occursOn ?? args.today).slice(0, 7),
            periodStart: intent.periodStart,
            periodEnd: intent.periodEnd,
            valuation: {
                acceptedTermId: typeof audit.accepted_term_id === "string" ? audit.accepted_term_id : null,
                acceptedPeriodAmountCents: typeof audit.accepted_period_amount_cents === "number" ? audit.accepted_period_amount_cents : null,
                periodDays: typeof audit.period_days_used === "number" ? audit.period_days_used : null,
                creditedDays: typeof audit.credited_days === "number" ? audit.credited_days : 1,
            },
        });
    }
}

async function compensateSupersededPostedReductions(
    supabase: SupabaseClient,
    orgId: string,
    plan: ReconcileConsumptionPlan,
    actorUserId: string | null,
): Promise<void> {
    const chargeIds = plan.compensateChargeIds ?? [];
    for (const chargeId of chargeIds) {
        try {
            await createChildcareCorrection(supabase, {
                orgId,
                sourceChargeId: chargeId,
                kind: "reversal",
                actorUserId,
                description: "vacation credit reversed — the day was corrected to attended",
                metadata: {
                    source: "operational_correction",
                    // Why this exists NOW, without re-stating why the original existed then.
                    reason: "the operational truth this reduction rested on was corrected",
                },
            });
        } catch (error) {
            const code = (error as { code?: string }).code;
            const message = String((error as { message?: string }).message ?? "");
            // Already answered, or not answerable by a reversal — both are states, not failures.
            if (code === "invalid_state" && /already been reversed|itself a correction|only posted/i.test(message)) continue;
            throw error;
        }
    }
}

async function buildReconcilePlan(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    preview: ConsumptionPreviewResult,
    prior: PriorLineage,
    agreementId: string | null,
    today: string,
): Promise<ReconcileConsumptionPlan> {
    const newObligations: ReconcileObligationPlan[] = [];
    const newKeys = new Set<string>();
    for (const o of preview.resolution.obligations) {
        if (o.resolutionKey) newKeys.add(o.resolutionKey);
        // Drift flag only (create-vs-recalc is decided by the RPC under lock, F1).
        const existing = o.resolutionKey ? await loadObligationByResolutionKey(supabase, orgId, o.resolutionKey) : null;
        const charge = await buildChargePlanForObligation(supabase, orgId, o, agreementId, today);
        const stale = existing != null && (existing.amount_cents !== o.amountCents || existing.billable_on !== o.billableOn);
        newObligations.push({
            resolutionKey: o.resolutionKey,
            obligationKind: o.obligationKind,
            chargeTemplateId: o.chargeTemplateId,
            serviceId: o.serviceId,
            amountCents: o.amountCents,
            currencyCode: o.currencyCode,
            responsibilityKey: o.responsibilityKey,
            occursOn: o.occursOn,
            billableOn: o.billableOn,
            periodStart: o.periodStart,
            periodEnd: o.periodEnd,
            reviewRequired: o.reviewRequired,
            status: charge != null ? "drafted" : o.status,
            reviewStatusStale: stale,
            explanation: o.explanation,
            charge,
        });
    }

    const retireChargeIds: string[] = [];
    const absentObligationIds: string[] = [];
    for (const po of prior.priorObligations) {
        const absent = !po.resolution_key || !newKeys.has(po.resolution_key);
        if (!absent) continue;
        absentObligationIds.push(po.id);
        if (po.draft_charge_id) {
            retireChargeIds.push(buildDraftChargeRetirementIntent(po.draft_charge_id).draftChargeId);
        }
    }

    /*
     * A SUPERSEDED OBLIGATION TAKES ITS MONEY WITH IT.
     *
     * An obligation that drafts its own charge is retired by the loop above, through
     * `draft_charge_id`. A vacation credit does not: it is non-draftable, and its money lives on the
     * contra charge of a Financial Reduction that points back at the obligation. Nothing joined
     * those two facts, so a correction superseded the obligation correctly and left the reduction's
     * draft contra charge live — an attended child keeping a vacation credit, which is the one
     * outcome Slice 4 exists to prevent. Measured on the certification stack before this existed:
     * obligation `superseded`, contra charge still `draft`, minus forty dollars still owed back.
     *
     * The charge ids are handed to the same retirement path, so posted money is untouched by the
     * same rule that already protects it — the RPC retires drafts only and reports zero rows for
     * anything settled. The application row itself is deliberately left standing: it is the record
     * that a credit was once decided, and a correction does not un-decide history.
     */
    const compensateChargeIds: string[] = [];
    if (absentObligationIds.length) {
        const { data: obsolete } = await supabase
            .from("financial_reduction_applications")
            .select("charge_id")
            .eq("org_id", orgId)
            .in("resolved_obligation_id", absentObligationIds);
        const obsoleteChargeIds = ((obsolete ?? []) as Array<{ charge_id: string | null }>)
            .map((r) => r.charge_id).filter((id): id is string => Boolean(id));
        if (obsoleteChargeIds.length) {
            /*
             * DRAFT AND POSTED ARE ANSWERED DIFFERENTLY, so they are separated here rather than in
             * the RPC. A draft consequence is retired in place; posted money is history and is
             * answered by appending its reversal. Sorting them by status at plan time keeps the
             * RPC's draft-only rule intact and gives the posted ones somewhere to go.
             */
            const { data: chargeRows } = await supabase
                .from("charges").select("id, status").eq("org_id", orgId).in("id", obsoleteChargeIds);
            const statusById = new Map(((chargeRows ?? []) as Array<{ id: string; status: string }>).map((c) => [c.id, c.status]));
            for (const chargeId of obsoleteChargeIds) {
                const status = statusById.get(chargeId);
                if (status === "posted") {
                    if (!compensateChargeIds.includes(chargeId)) compensateChargeIds.push(chargeId);
                    continue;
                }
                const intent = buildDraftChargeRetirementIntent(chargeId).draftChargeId;
                if (!retireChargeIds.includes(intent)) retireChargeIds.push(intent);
            }
        }
    }

    const ev = preview.resolution.event;
    return {
        compensateChargeIds,
        correctionEvent: {
            idempotencyKey: ev.idempotencyKey,
            eventTypeId: ev.eventTypeId,
            eventKey: ev.eventKey,
            sourceFamily: ev.sourceFamily,
            sourceEntityType: ev.sourceEntityType,
            sourceEntityId: ev.sourceEntityId,
            subjectType: ev.subjectType,
            subjectId: ev.subjectId,
            locationId: ev.locationId,
            occursOn: ev.occursOn,
            effectiveOn: ev.effectiveOn,
            status: ev.status,
            context: ev.context,
        },
        priorFactId: fact.correctsFactId as string,
        newObligations,
        retireChargeIds,
    };
}

/**
 * Draft a correction/reversal fact. Plans in TS, then executes ALL reconciliation
 * writes in ONE atomic RPC (DP-1). Returns null (→ caller falls through to the
 * original path) when lineage is missing or no prior consumption event exists.
 */
async function draftCorrectionConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
    actorUserId: string | null,
): Promise<ConsumptionDraftResult | null> {
    if (!fact.correctsFactId) return null; // correction_lineage_missing → original path
    const preview = await previewConsumptionCore(supabase, orgId, fact, today);
    const prior = await locatePriorEvent(supabase, orgId, fact);
    if (!prior) return null; // no_prior_consumption_event → original path

    const supersession = supersessionFromPrior(preview, prior);
    const agreementId = agreementIdFromFact(fact);
    const plan = await buildReconcilePlan(supabase, orgId, fact, preview, prior, agreementId, today);
    const result = await reconcileConsumptionCorrection(supabase, { orgId, actorUserId, plan });
    if (!result.ok) fail("db_error", `reconcile_consumption failed: ${result.error}`);

    await compensateSupersededPostedReductions(supabase, orgId, plan, actorUserId);

    // Load the final obligations owned by the new correction event for the breakdown.
    const { data, error } = await supabase
        .from(OBLIGATIONS_TABLE)
        .select("id, obligation_kind, draft_charge_id, status, resolution_key")
        .eq("org_id", orgId)
        .eq("consumption_event_id", result.consumptionEventId);
    if (error) fail("db_error", error.message);
    const e1Obls = (data ?? []) as { id: string; obligation_kind: ObligationKind | null; draft_charge_id: string | null; status: string; resolution_key: string | null }[];

    /*
     * A RESTORED CONSEQUENCE IS STILL A CONSEQUENCE.
     *
     * The correction path reconciled obligations and returned, so a corrected truth that newly
     * warrants money could never get any: A corrected to attended and corrected back again left the
     * obligation reinstated and the family uncredited. Measured, on the certification stack.
     *
     * It runs the SAME writer the original path runs, with the same eligibility reading. What makes
     * the restored credit a new credit rather than a revival is the identity: the obligation is the
     * same row, but it is now current under a new consumption event, and the reduction is keyed on
     * both. The withdrawn artifact stays withdrawn beside it.
     *
     * Matched by resolution key, because that is what reconciliation itself uses to decide an
     * obligation is the same logical thing across corrections.
     */
    const byKey = new Map(e1Obls.filter((o) => o.resolution_key).map((o) => [o.resolution_key!, o.id]));
    const restorable: Array<{ persistedId: string; intent: ResolvedObligationIntent }> = [];
    for (const intent of preview.resolution.obligations) {
        const persistedId = intent.resolutionKey ? byKey.get(intent.resolutionKey) : undefined;
        if (persistedId) restorable.push({ persistedId, intent });
    }
    await materializeCurrentFinancialConsequences(supabase, orgId, {
        obligations: restorable,
        consumptionEventId: result.consumptionEventId,
        agreementId,
        today,
        actorUserId,
    });
    const drafted = e1Obls.map((o) => ({
        obligationKind: (o.obligation_kind ?? "registration") as ObligationKind,
        draftChargeId: o.draft_charge_id,
        draftChargeStatus: o.draft_charge_id ? "draft" : null,
    }));
    const firstDraft = e1Obls.find((o) => o.draft_charge_id)?.draft_charge_id ?? null;

    return {
        ...preview,
        supersession,
        persisted: {
            consumptionEventId: result.consumptionEventId,
            resolvedObligationIds: e1Obls.map((o) => o.id),
            draftChargeId: firstDraft,
            draftChargeStatus: firstDraft ? "draft" : null,
            obligations: drafted,
        },
        superseded: {
            obligationIds: result.supersededObligationIds,
            voidedDraftChargeIds: result.retiredChargeIds,
            reparentedObligationIds: result.reparentedObligationIds,
            priorConsumptionEventId: result.priorConsumptionEventId,
        },
    };
}

/**
 * Persist a Consumption Event, its Resolved Obligation(s), and (via the existing
 * lifecycle service) an idempotent DRAFT charge. Re-running is idempotent. Never
 * posts; never mutates a posted charge. Preview-only computation lives in
 * previewConsumption — this is the only path that writes.
 *
 * D12a: a correction/reversal fact with resolvable lineage routes through the
 * atomic reconciliation RPC (draftCorrectionConsumption); the `original` path
 * below is byte-behavior unchanged.
 */
export async function draftConsumption(
    supabase: SupabaseClient,
    orgId: string,
    fact: OperationalFactDto,
    today: string,
    actorUserId: string | null = null,
): Promise<ConsumptionDraftResult> {
    const entryType = fact.entryType ?? "original";
    if (entryType === "correction" || entryType === "reversal") {
        const reconciled = await draftCorrectionConsumption(supabase, orgId, fact, today, actorUserId);
        if (reconciled) return reconciled;
        // lineage missing / no prior event → fall through to the original write path.
    }

    const preview = await previewConsumption(supabase, orgId, fact, today);
    const consumptionEventId = await upsertConsumptionEvent(supabase, orgId, preview.resolution, actorUserId);

    const agreementId = agreementIdFromFact(fact);
    const resolvedObligationIds: string[] = [];
    const materializable: Array<{ persistedId: string; intent: ResolvedObligationIntent }> = [];
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
        materializable.push({ persistedId: id, intent: obligation });
        drafted.push({ obligationKind: obligation.obligationKind, draftChargeId, draftChargeStatus });
        if (firstDraftChargeId == null && draftChargeId != null) {
            firstDraftChargeId = draftChargeId;
            firstDraftChargeStatus = draftChargeStatus;
        }
    }

    /*
     * MONEY AFTER THE OBLIGATIONS EXIST, AND ONLY THEN. The reduction is anchored on the obligation
     * and the event that made it current, so it cannot be written before both are persisted; that
     * ordering is the idempotency, not an implementation detail.
     */
    await materializeCurrentFinancialConsequences(supabase, orgId, {
        obligations: materializable, consumptionEventId, agreementId, today, actorUserId,
    });

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
