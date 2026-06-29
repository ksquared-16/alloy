/**
 * Rate authoring (P3.2 write side) — versioned, effective-dated writes for
 * childcare rate plans and rate rules (Operational Configuration V1, Batch 1).
 *
 * Doctrine (do NOT violate):
 *   * Never overwrite financial/configuration truth. "Edit" = create a new
 *     version effective on a chosen date; the prior row's effective_end is closed
 *     the day before. Mirrors supersedeChildPlacement / supersedeScheduleAssignment.
 *   * No posting, payments, invoices, AR, subsidy, charge resolution, or GL writes
 *     here. This module only authors L1 rate CONFIGURATION; Rate Resolution
 *     (resolveRate.ts) reads it.
 *   * Server-only and role-gated at the route layer (admin/ops). Never invoked
 *     from the client directly.
 *
 * Supersede has no dedicated status/`supersedes_id` columns on the rate tables
 * (unlike placements): lineage is expressed by effective dating, and the prior
 * version link is preserved in `metadata` for auditability without a schema
 * change. No migration is required for Batch 1 — schema + RLS already allow the
 * scoped insert/update/delete.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    assertValidIsoDate,
    compareIsoDates,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import { planSupersede } from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import {
    CONFIG_RULE_SCOPE_TYPES,
    type ConfigRuleScopeType,
} from "@/lib/childcareOperational/config/configRuleTypes";
import {
    BILLING_CADENCES,
    DEFAULT_RATE_CURRENCY_CODE,
    PRORATION_METHODS,
    isCalculationStrategy,
    isRateBasis,
    isScheduleBasis,
    type BillingBasis,
    type BillingCadence,
    type CalculationStrategy,
    type ChildcareRatePlanRow,
    type ChildcareRateRuleRow,
    type ProrationMethod,
    type RateBasis,
    type ScheduleBasis,
} from "@/lib/financials/rates/rateTypes";

const PLANS = "childcare_rate_plans";
const RULES = "childcare_rate_rules";

function fail(
    code: OperationalEnrollmentServiceError["code"],
    message: string,
    details?: Record<string, unknown>,
): never {
    throw new OperationalEnrollmentServiceError(code, message, details);
}

function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** lineage origin = the genesis version id of a plan/rule lineage. */
function lineageOriginOf(metadata: Record<string, unknown>, ownId: string): string {
    const origin = metadata.lineage_origin_id;
    return typeof origin === "string" && origin.length > 0 ? origin : ownId;
}

// ---------------------------------------------------------------------------
// Targeted fetchers (org-scoped). Resolution/precedence stays in resolveRate.
// ---------------------------------------------------------------------------

async function getRatePlanById(
    supabase: SupabaseClient,
    orgId: string,
    planId: string,
): Promise<ChildcareRatePlanRow> {
    const { data, error } = await supabase
        .from(PLANS)
        .select("*")
        .eq("org_id", orgId)
        .eq("id", planId)
        .maybeSingle();
    if (error) fail("db_error", error.message);
    if (!data) fail("not_found", "Rate plan not found", { planId });
    return data as ChildcareRatePlanRow;
}

async function getRateRuleById(
    supabase: SupabaseClient,
    orgId: string,
    ruleId: string,
): Promise<ChildcareRateRuleRow> {
    const { data, error } = await supabase
        .from(RULES)
        .select("*")
        .eq("org_id", orgId)
        .eq("id", ruleId)
        .maybeSingle();
    if (error) fail("db_error", error.message);
    if (!data) fail("not_found", "Rate rule not found", { ruleId });
    return data as ChildcareRateRuleRow;
}

async function listPlanLineage(
    supabase: SupabaseClient,
    orgId: string,
    plan: ChildcareRatePlanRow,
): Promise<ChildcareRatePlanRow[]> {
    const { data, error } = await supabase
        .from(PLANS)
        .select("*")
        .eq("org_id", orgId)
        .eq("plan_key", plan.plan_key)
        .eq("scope_type", plan.scope_type);
    if (error) fail("db_error", error.message);
    // Narrow to the same scope target + age group (lineage identity).
    return (data as ChildcareRatePlanRow[]).filter(
        (p) =>
            (p.site_location_id ?? null) === (plan.site_location_id ?? null) &&
            (p.program_category_id ?? null) === (plan.program_category_id ?? null) &&
            (p.room_location_id ?? null) === (plan.room_location_id ?? null) &&
            (p.age_group_key ?? null) === (plan.age_group_key ?? null),
    );
}

async function listRulesForPlan(
    supabase: SupabaseClient,
    orgId: string,
    planId: string,
): Promise<ChildcareRateRuleRow[]> {
    const { data, error } = await supabase
        .from(RULES)
        .select("*")
        .eq("org_id", orgId)
        .eq("rate_plan_id", planId);
    if (error) fail("db_error", error.message);
    return data as ChildcareRateRuleRow[];
}

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

type ScopeColumns = {
    scope_type: ConfigRuleScopeType;
    site_location_id: string | null;
    program_category_id: string | null;
    room_location_id: string | null;
};

/** Validate scope shape (mirrors the DB CHECK) and normalize the scope columns. */
function buildScopeColumns(input: {
    scopeType: string;
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
}): ScopeColumns {
    const scopeType = input.scopeType as ConfigRuleScopeType;
    if (!CONFIG_RULE_SCOPE_TYPES.includes(scopeType)) {
        fail("invalid_input", `scopeType must be one of ${CONFIG_RULE_SCOPE_TYPES.join(", ")}`);
    }
    const site = trimOrNull(input.siteLocationId);
    const program = trimOrNull(input.programCategoryId);
    const room = trimOrNull(input.roomLocationId);

    const shape: Record<ConfigRuleScopeType, ScopeColumns> = {
        org: { scope_type: "org", site_location_id: null, program_category_id: null, room_location_id: null },
        site: { scope_type: "site", site_location_id: site, program_category_id: null, room_location_id: null },
        program: { scope_type: "program", site_location_id: null, program_category_id: program, room_location_id: null },
        room: { scope_type: "room", site_location_id: null, program_category_id: null, room_location_id: room },
    };
    const cols = shape[scopeType];
    if (scopeType === "site" && !cols.site_location_id) fail("invalid_input", "site scope requires siteLocationId");
    if (scopeType === "program" && !cols.program_category_id) fail("invalid_input", "program scope requires programCategoryId");
    if (scopeType === "room" && !cols.room_location_id) fail("invalid_input", "room scope requires roomLocationId");
    return cols;
}

function requireBillingBasis(value: unknown): BillingBasis {
    if (!isRateBasis(value)) fail("invalid_input", "billingBasis is invalid");
    return value;
}

function optionalCalcStrategy(value: unknown): CalculationStrategy {
    if (value == null) return "scheduled";
    if (!isCalculationStrategy(value)) fail("invalid_input", "calculationStrategy is invalid");
    return value;
}

function optionalProration(value: unknown): ProrationMethod | null {
    const v = trimOrNull(value);
    if (v == null) return null;
    if (!(PRORATION_METHODS as readonly string[]).includes(v)) fail("invalid_input", "prorationMethod is invalid");
    return v as ProrationMethod;
}

function optionalCadence(value: unknown): BillingCadence | null {
    const v = trimOrNull(value);
    if (v == null) return null;
    if (!(BILLING_CADENCES as readonly string[]).includes(v)) fail("invalid_input", "billingCadence is invalid");
    return v as BillingCadence;
}

function requireEffectiveStart(value: unknown): string {
    const v = trimOrNull(value);
    if (!v) fail("invalid_input", "effectiveStart is required");
    assertValidIsoDate(v, "effectiveStart");
    return v;
}

function optionalEffectiveEnd(value: unknown, effectiveStart: string): string | null {
    const v = trimOrNull(value);
    if (v == null) return null;
    assertValidIsoDate(v, "effectiveEnd");
    const rangeError = validateEndOnOrAfterStart(effectiveStart, v);
    if (rangeError) fail("validation_failed", rangeError.message);
    return v;
}

// ---------------------------------------------------------------------------
// Rate plans — create / version (supersede) / retire / void
// ---------------------------------------------------------------------------

export type CreateRatePlanInput = {
    orgId: string;
    scopeType: string;
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    ageGroupKey?: string | null;
    planKey: string;
    label?: string | null;
    currencyCode?: string | null;
    billingBasis: string;
    calculationStrategy?: string | null;
    prorationMethod?: string | null;
    billingCadence?: string | null;
    effectiveStart: string;
    effectiveEnd?: string | null;
    isActive?: boolean;
    sourceKey?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createRatePlan(
    supabase: SupabaseClient,
    input: CreateRatePlanInput,
): Promise<ChildcareRatePlanRow> {
    const planKey = trimOrNull(input.planKey);
    if (!planKey) fail("invalid_input", "planKey is required");
    const scope = buildScopeColumns(input);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const actor = trimOrNull(input.actorUserId);

    const row = {
        org_id: input.orgId,
        ...scope,
        age_group_key: trimOrNull(input.ageGroupKey),
        plan_key: planKey,
        label: trimOrNull(input.label),
        currency_code: (trimOrNull(input.currencyCode) ?? DEFAULT_RATE_CURRENCY_CODE).toUpperCase(),
        billing_basis: requireBillingBasis(input.billingBasis),
        calculation_strategy: optionalCalcStrategy(input.calculationStrategy),
        proration_method: optionalProration(input.prorationMethod),
        billing_cadence: optionalCadence(input.billingCadence),
        is_active: input.isActive ?? true,
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: trimOrNull(input.sourceKey) ?? "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    };

    const { data, error } = await supabase.from(PLANS).insert(row).select("*").single();
    if (error || !data) fail("db_error", error?.message ?? "rate plan insert failed");
    return data as ChildcareRatePlanRow;
}

export type CreateRatePlanVersionInput = {
    orgId: string;
    priorPlanId: string;
    effectiveStart: string;
    /** Optional plan-attribute overrides; anything omitted carries from prior. */
    label?: string | null;
    currencyCode?: string | null;
    billingBasis?: string | null;
    calculationStrategy?: string | null;
    prorationMethod?: string | null;
    billingCadence?: string | null;
    metadata?: Record<string, unknown>;
    /** Copy the prior version's currently-effective rules forward (default true). */
    carryForwardRules?: boolean;
    actorUserId?: string | null;
};

export type CreateRatePlanVersionResult = {
    plan: ChildcareRatePlanRow;
    priorPlanId: string;
    priorCloseDate: string;
    carriedRuleCount: number;
};

/**
 * Create a future/effective version of an existing rate plan (supersede). Inserts
 * a new plan row sharing the prior lineage, carries the prior version's currently
 * effective rules forward so resolution never falls into a "no_rule" hole, then
 * closes the prior plan's effective_end the day before the new start.
 */
export async function createRatePlanVersion(
    supabase: SupabaseClient,
    input: CreateRatePlanVersionInput,
): Promise<CreateRatePlanVersionResult> {
    const prior = await getRatePlanById(supabase, input.orgId, input.priorPlanId);
    const newStart = requireEffectiveStart(input.effectiveStart);
    const actor = trimOrNull(input.actorUserId);

    const plan = planSupersede({
        priorStart: prior.effective_start,
        priorEnd: prior.effective_end,
        newStart,
    });
    if (!plan.ok) fail(plan.error.code, plan.error.message);
    const closeDate = plan.closeDate;

    const priorMeta = asMetadata(prior.metadata);
    const billingBasis =
        input.billingBasis != null ? requireBillingBasis(input.billingBasis) : prior.billing_basis;
    const calcStrategy =
        input.calculationStrategy != null
            ? optionalCalcStrategy(input.calculationStrategy)
            : prior.calculation_strategy;

    const newRow = {
        org_id: input.orgId,
        scope_type: prior.scope_type,
        site_location_id: prior.site_location_id,
        program_category_id: prior.program_category_id,
        room_location_id: prior.room_location_id,
        age_group_key: prior.age_group_key,
        plan_key: prior.plan_key,
        label: input.label !== undefined ? trimOrNull(input.label) : prior.label,
        currency_code:
            input.currencyCode != null
                ? (trimOrNull(input.currencyCode) ?? prior.currency_code).toUpperCase()
                : prior.currency_code,
        billing_basis: billingBasis,
        calculation_strategy: calcStrategy,
        proration_method:
            input.prorationMethod !== undefined
                ? optionalProration(input.prorationMethod)
                : prior.proration_method,
        billing_cadence:
            input.billingCadence !== undefined
                ? optionalCadence(input.billingCadence)
                : prior.billing_cadence,
        is_active: true,
        effective_start: newStart,
        effective_end: null,
        source_key: prior.source_key,
        metadata: {
            ...asMetadata(input.metadata),
            lineage_origin_id: lineageOriginOf(priorMeta, prior.id),
            supersedes_id: prior.id,
        },
        created_by: actor,
        updated_by: actor,
    };

    const { data: inserted, error: insertError } = await supabase
        .from(PLANS)
        .insert(newRow)
        .select("*")
        .single();
    if (insertError || !inserted) fail("db_error", insertError?.message ?? "rate plan version insert failed");
    const newPlan = inserted as ChildcareRatePlanRow;

    let carriedRuleCount = 0;
    if (input.carryForwardRules !== false) {
        carriedRuleCount = await carryForwardRules(
            supabase,
            input.orgId,
            prior.id,
            newPlan.id,
            closeDate,
            newStart,
            actor,
        );
    }

    const { error: closeError } = await supabase
        .from(PLANS)
        .update({ effective_end: closeDate, updated_by: actor })
        .eq("org_id", input.orgId)
        .eq("id", prior.id);
    if (closeError) fail("db_error", closeError.message);

    return { plan: newPlan, priorPlanId: prior.id, priorCloseDate: closeDate, carriedRuleCount };
}

/** Copy the prior plan's rules that are effective on `asOf` into the new plan. */
async function carryForwardRules(
    supabase: SupabaseClient,
    orgId: string,
    priorPlanId: string,
    newPlanId: string,
    asOf: string,
    newStart: string,
    actor: string | null,
): Promise<number> {
    const rules = await listRulesForPlan(supabase, orgId, priorPlanId);
    // For each (schedule_basis, age_group) keep the version effective on `asOf`
    // with the latest effective_start — the rule that actually resolves today.
    const winners = new Map<string, ChildcareRateRuleRow>();
    for (const rule of rules) {
        const effective =
            compareIsoDates(rule.effective_start, asOf) <= 0 &&
            (rule.effective_end == null || compareIsoDates(asOf, rule.effective_end) <= 0);
        if (!effective) continue;
        const key = `${rule.schedule_basis}::${rule.age_group_key ?? ""}`;
        const incumbent = winners.get(key);
        if (!incumbent || compareIsoDates(rule.effective_start, incumbent.effective_start) > 0) {
            winners.set(key, rule);
        }
    }
    if (winners.size === 0) return 0;
    const carried = [...winners.values()].map((rule) => ({
        org_id: orgId,
        rate_plan_id: newPlanId,
        schedule_basis: rule.schedule_basis,
        rate_basis: rule.rate_basis,
        age_group_key: rule.age_group_key,
        amount_cents: rule.amount_cents,
        effective_start: newStart,
        effective_end: null,
        source_key: rule.source_key,
        metadata: { carried_from_rule_id: rule.id },
        created_by: actor,
        updated_by: actor,
    }));
    const { error } = await supabase.from(RULES).insert(carried);
    if (error) fail("db_error", error.message);
    return carried.length;
}

export type RetireRatePlanInput = {
    orgId: string;
    planId: string;
    /** Last effective day; the plan stops resolving after this date. */
    effectiveEnd: string;
    todayYmd: string;
    actorUserId?: string | null;
};

/**
 * Retire a rate plan by closing its effective window (date-based, non-destructive).
 * A future end date shows as Current now and Retired once it passes; an end date
 * on or before today also hard-disables (is_active=false) so it stops resolving
 * immediately.
 */
export async function retireRatePlan(
    supabase: SupabaseClient,
    input: RetireRatePlanInput,
): Promise<ChildcareRatePlanRow> {
    const prior = await getRatePlanById(supabase, input.orgId, input.planId);
    const end = trimOrNull(input.effectiveEnd);
    if (!end) fail("invalid_input", "effectiveEnd is required to retire a plan");
    assertValidIsoDate(end, "effectiveEnd");
    assertValidIsoDate(input.todayYmd, "todayYmd");
    const rangeError = validateEndOnOrAfterStart(prior.effective_start, end);
    if (rangeError) fail("validation_failed", rangeError.message);
    const actor = trimOrNull(input.actorUserId);

    const update: Record<string, unknown> = { effective_end: end, updated_by: actor };
    if (compareIsoDates(end, input.todayYmd) <= 0) update.is_active = false;

    const { data, error } = await supabase
        .from(PLANS)
        .update(update)
        .eq("org_id", input.orgId)
        .eq("id", input.planId)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "rate plan retire failed");
    return data as ChildcareRatePlanRow;
}

export type VoidRatePlanVersionInput = {
    orgId: string;
    planId: string;
    todayYmd: string;
    actorUserId?: string | null;
};

export type VoidResult = { voided: true; id: string; reopenedPriorId: string | null };

/**
 * Void (hard-delete) a not-yet-started rate plan version — rollback of a pending
 * change before it ever resolves. Reopens the version it superseded (clears the
 * prior effective_end) so continuity is restored. Refuses to void any version
 * that is or was ever effective.
 */
export async function voidScheduledRatePlanVersion(
    supabase: SupabaseClient,
    input: VoidRatePlanVersionInput,
): Promise<VoidResult> {
    const plan = await getRatePlanById(supabase, input.orgId, input.planId);
    assertValidIsoDate(input.todayYmd, "todayYmd");
    if (compareIsoDates(plan.effective_start, input.todayYmd) <= 0) {
        fail("invalid_state", "Only a scheduled (future) version can be voided; retire an active version instead");
    }
    const lineage = await listPlanLineage(supabase, input.orgId, plan);
    const hasLater = lineage.some(
        (p) => p.id !== plan.id && compareIsoDates(p.effective_start, plan.effective_start) > 0,
    );
    if (hasLater) fail("invalid_state", "Cannot void a version that has a later version");
    const actor = trimOrNull(input.actorUserId);

    const supersedesId = asMetadata(plan.metadata).supersedes_id;
    let reopenedPriorId: string | null = null;
    if (typeof supersedesId === "string" && supersedesId.length > 0) {
        const { error: reopenError } = await supabase
            .from(PLANS)
            .update({ effective_end: null, updated_by: actor })
            .eq("org_id", input.orgId)
            .eq("id", supersedesId);
        if (reopenError) fail("db_error", reopenError.message);
        reopenedPriorId = supersedesId;
    }

    // Delete child rules explicitly (the FK is ON DELETE CASCADE too, but voiding
    // should be self-contained and not silently depend on schema config).
    const { error: childError } = await supabase
        .from(RULES)
        .delete()
        .eq("org_id", input.orgId)
        .eq("rate_plan_id", input.planId);
    if (childError) fail("db_error", childError.message);

    const { error: deleteError } = await supabase
        .from(PLANS)
        .delete()
        .eq("org_id", input.orgId)
        .eq("id", input.planId);
    if (deleteError) fail("db_error", deleteError.message);

    return { voided: true, id: input.planId, reopenedPriorId };
}

// ---------------------------------------------------------------------------
// Rate rules — create / version (supersede) / retire / void
// ---------------------------------------------------------------------------

function requireScheduleBasis(value: unknown): ScheduleBasis {
    if (!isScheduleBasis(value)) fail("invalid_input", "scheduleBasis is invalid");
    return value;
}

function requireRateBasis(value: unknown): RateBasis {
    if (!isRateBasis(value)) fail("invalid_input", "rateBasis is invalid");
    return value;
}

function requireAmountCents(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < 0) fail("invalid_input", "amountCents must be a non-negative integer");
    return n;
}

export type CreateRateRuleInput = {
    orgId: string;
    ratePlanId: string;
    scheduleBasis: string;
    rateBasis: string;
    ageGroupKey?: string | null;
    amountCents: number;
    effectiveStart: string;
    effectiveEnd?: string | null;
    sourceKey?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createRateRule(
    supabase: SupabaseClient,
    input: CreateRateRuleInput,
): Promise<ChildcareRateRuleRow> {
    // Confirm the parent plan exists in this org (the DB trigger also enforces org match).
    await getRatePlanById(supabase, input.orgId, input.ratePlanId);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const actor = trimOrNull(input.actorUserId);

    const row = {
        org_id: input.orgId,
        rate_plan_id: input.ratePlanId,
        schedule_basis: requireScheduleBasis(input.scheduleBasis),
        rate_basis: requireRateBasis(input.rateBasis),
        age_group_key: trimOrNull(input.ageGroupKey),
        amount_cents: requireAmountCents(input.amountCents),
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: trimOrNull(input.sourceKey) ?? "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    };

    const { data, error } = await supabase.from(RULES).insert(row).select("*").single();
    if (error || !data) fail("db_error", error?.message ?? "rate rule insert failed");
    return data as ChildcareRateRuleRow;
}

export type CreateRateRuleVersionInput = {
    orgId: string;
    priorRuleId: string;
    effectiveStart: string;
    /** Optional overrides; omitted fields carry from the prior rule. */
    amountCents?: number | null;
    rateBasis?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export type CreateRateRuleVersionResult = {
    rule: ChildcareRateRuleRow;
    priorRuleId: string;
    priorCloseDate: string;
};

/**
 * Create a future/effective version of an existing rate rule (supersede): the
 * "2026 tuition → 2027 tuition" flow. Inserts a new rule for the same plan /
 * schedule basis / age group and closes the prior rule the day before.
 */
export async function createRateRuleVersion(
    supabase: SupabaseClient,
    input: CreateRateRuleVersionInput,
): Promise<CreateRateRuleVersionResult> {
    const prior = await getRateRuleById(supabase, input.orgId, input.priorRuleId);
    const newStart = requireEffectiveStart(input.effectiveStart);
    const actor = trimOrNull(input.actorUserId);

    const plan = planSupersede({
        priorStart: prior.effective_start,
        priorEnd: prior.effective_end,
        newStart,
    });
    if (!plan.ok) fail(plan.error.code, plan.error.message);
    const closeDate = plan.closeDate;

    const newRow = {
        org_id: input.orgId,
        rate_plan_id: prior.rate_plan_id,
        schedule_basis: prior.schedule_basis,
        rate_basis: input.rateBasis != null ? requireRateBasis(input.rateBasis) : prior.rate_basis,
        age_group_key: prior.age_group_key,
        amount_cents: input.amountCents != null ? requireAmountCents(input.amountCents) : prior.amount_cents,
        effective_start: newStart,
        effective_end: null,
        source_key: prior.source_key,
        metadata: {
            ...asMetadata(input.metadata),
            lineage_origin_id: lineageOriginOf(asMetadata(prior.metadata), prior.id),
            supersedes_id: prior.id,
        },
        created_by: actor,
        updated_by: actor,
    };

    const { data: inserted, error: insertError } = await supabase
        .from(RULES)
        .insert(newRow)
        .select("*")
        .single();
    if (insertError || !inserted) fail("db_error", insertError?.message ?? "rate rule version insert failed");

    const { error: closeError } = await supabase
        .from(RULES)
        .update({ effective_end: closeDate, updated_by: actor })
        .eq("org_id", input.orgId)
        .eq("id", prior.id);
    if (closeError) fail("db_error", closeError.message);

    return { rule: inserted as ChildcareRateRuleRow, priorRuleId: prior.id, priorCloseDate: closeDate };
}

export type RetireRateRuleInput = {
    orgId: string;
    ruleId: string;
    effectiveEnd: string;
    actorUserId?: string | null;
};

/** Retire a rate rule by closing its effective window (rules have no is_active). */
export async function retireRateRule(
    supabase: SupabaseClient,
    input: RetireRateRuleInput,
): Promise<ChildcareRateRuleRow> {
    const prior = await getRateRuleById(supabase, input.orgId, input.ruleId);
    const end = trimOrNull(input.effectiveEnd);
    if (!end) fail("invalid_input", "effectiveEnd is required to retire a rule");
    assertValidIsoDate(end, "effectiveEnd");
    const rangeError = validateEndOnOrAfterStart(prior.effective_start, end);
    if (rangeError) fail("validation_failed", rangeError.message);
    const actor = trimOrNull(input.actorUserId);

    const { data, error } = await supabase
        .from(RULES)
        .update({ effective_end: end, updated_by: actor })
        .eq("org_id", input.orgId)
        .eq("id", input.ruleId)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "rate rule retire failed");
    return data as ChildcareRateRuleRow;
}

export type VoidRateRuleVersionInput = {
    orgId: string;
    ruleId: string;
    todayYmd: string;
    actorUserId?: string | null;
};

/**
 * Void (hard-delete) a not-yet-started rate rule version and reopen the rule it
 * superseded. Refuses to void a rule that is or was ever effective.
 */
export async function voidScheduledRateRuleVersion(
    supabase: SupabaseClient,
    input: VoidRateRuleVersionInput,
): Promise<VoidResult> {
    const rule = await getRateRuleById(supabase, input.orgId, input.ruleId);
    assertValidIsoDate(input.todayYmd, "todayYmd");
    if (compareIsoDates(rule.effective_start, input.todayYmd) <= 0) {
        fail("invalid_state", "Only a scheduled (future) version can be voided; retire an active version instead");
    }
    const actor = trimOrNull(input.actorUserId);

    const supersedesId = asMetadata(rule.metadata).supersedes_id;
    let reopenedPriorId: string | null = null;
    if (typeof supersedesId === "string" && supersedesId.length > 0) {
        const { error: reopenError } = await supabase
            .from(RULES)
            .update({ effective_end: null, updated_by: actor })
            .eq("org_id", input.orgId)
            .eq("id", supersedesId);
        if (reopenError) fail("db_error", reopenError.message);
        reopenedPriorId = supersedesId;
    }

    const { error: deleteError } = await supabase
        .from(RULES)
        .delete()
        .eq("org_id", input.orgId)
        .eq("id", input.ruleId);
    if (deleteError) fail("db_error", deleteError.message);

    return { voided: true, id: input.ruleId, reopenedPriorId };
}
