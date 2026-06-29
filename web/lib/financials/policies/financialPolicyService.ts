/**
 * Financial Policy authoring (Commercial Model, Slice C) — scoped, effective-dated
 * configuration. Read + supersede write (create / version / retire / void),
 * mirroring the rate-plan / charge-template discipline: a version is a new row +
 * the prior effective_end closed the day before; never an in-place overwrite of a
 * policy value. Configuration only — posts nothing, writes no ledger/GL/AR.
 *
 * Server-only; role-gated at the route layer (admin/ops).
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
    FINANCIAL_POLICY_SCOPE_TYPES,
    isFinancialPolicyType,
    validatePolicyValue,
    type FinancialPolicyRow,
    type FinancialPolicyScopeType,
    type FinancialPolicyType,
} from "@/lib/financials/policies/financialPolicyTypes";

const TABLE = "financial_policies";

type Code = OperationalEnrollmentServiceError["code"];
function fail(code: Code, message: string): never {
    throw new OperationalEnrollmentServiceError(code, message);
}
function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function lineageOriginOf(metadata: Record<string, unknown>, ownId: string): string {
    const origin = metadata.lineage_origin_id;
    return typeof origin === "string" && origin.length > 0 ? origin : ownId;
}

type ScopeColumns = {
    scope_type: FinancialPolicyScopeType;
    location_id: string | null;
    service_id: string | null;
    rate_plan_id: string | null;
};

export type PolicyScopeInput = {
    scopeType: string;
    locationId?: string | null;
    serviceId?: string | null;
    ratePlanId?: string | null;
};

function buildScope(input: PolicyScopeInput): ScopeColumns {
    const scopeType = input.scopeType as FinancialPolicyScopeType;
    if (!FINANCIAL_POLICY_SCOPE_TYPES.includes(scopeType)) {
        fail("invalid_input", `scopeType must be one of ${FINANCIAL_POLICY_SCOPE_TYPES.join(", ")}`);
    }
    const location = trimOrNull(input.locationId);
    const service = trimOrNull(input.serviceId);
    const ratePlan = trimOrNull(input.ratePlanId);
    const shape: Record<FinancialPolicyScopeType, ScopeColumns> = {
        org: { scope_type: "org", location_id: null, service_id: null, rate_plan_id: null },
        location: { scope_type: "location", location_id: location, service_id: null, rate_plan_id: null },
        service: { scope_type: "service", location_id: null, service_id: service, rate_plan_id: null },
        rate_plan: { scope_type: "rate_plan", location_id: null, service_id: null, rate_plan_id: ratePlan },
    };
    const cols = shape[scopeType];
    if (scopeType === "location" && !cols.location_id) fail("invalid_input", "location scope requires a location");
    if (scopeType === "service" && !cols.service_id) fail("invalid_input", "service scope requires a service");
    if (scopeType === "rate_plan" && !cols.rate_plan_id) fail("invalid_input", "rate_plan scope requires a rate plan");
    return cols;
}

function requirePolicyType(value: unknown): FinancialPolicyType {
    if (!isFinancialPolicyType(value)) fail("invalid_input", "policyType is invalid");
    return value;
}

function validatedValue(policyType: FinancialPolicyType, raw: Record<string, unknown> | undefined): Record<string, unknown> {
    const result = validatePolicyValue(policyType, raw ?? {});
    if (!result.ok) fail(result.error.code, result.error.message);
    return result.value;
}

function requireEffectiveStart(value: unknown): string {
    const v = trimOrNull(value);
    if (!v) fail("invalid_input", "effectiveStart is required");
    assertValidIsoDate(v, "effectiveStart");
    return v;
}

async function getById(supabase: SupabaseClient, orgId: string, id: string): Promise<FinancialPolicyRow> {
    const { data, error } = await supabase.from(TABLE).select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) fail("db_error", error.message);
    if (!data) fail("not_found", "Financial policy not found");
    return data as FinancialPolicyRow;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listFinancialPolicies(supabase: SupabaseClient, orgId: string): Promise<FinancialPolicyRow[]> {
    const { data, error } = await supabase.from(TABLE).select("*").eq("org_id", orgId);
    if (error) fail("db_error", error.message);
    return (data ?? []) as FinancialPolicyRow[];
}

// ---------------------------------------------------------------------------
// Create / version / retire / void
// ---------------------------------------------------------------------------

export type CreateFinancialPolicyInput = PolicyScopeInput & {
    orgId: string;
    policyType: string;
    label?: string | null;
    description?: string | null;
    value?: Record<string, unknown>;
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createFinancialPolicy(
    supabase: SupabaseClient,
    input: CreateFinancialPolicyInput,
): Promise<FinancialPolicyRow> {
    const scope = buildScope(input);
    const policyType = requirePolicyType(input.policyType);
    const value = validatedValue(policyType, input.value);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = trimOrNull(input.effectiveEnd);
    if (effectiveEnd) {
        assertValidIsoDate(effectiveEnd, "effectiveEnd");
        const rangeError = validateEndOnOrAfterStart(effectiveStart, effectiveEnd);
        if (rangeError) fail("validation_failed", rangeError.message);
    }
    const actor = trimOrNull(input.actorUserId);
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: input.orgId,
            ...scope,
            policy_type: policyType,
            label: trimOrNull(input.label),
            description: trimOrNull(input.description),
            value,
            is_active: true,
            effective_start: effectiveStart,
            effective_end: effectiveEnd,
            source_key: "config",
            metadata: asMetadata(input.metadata),
            created_by: actor,
            updated_by: actor,
        })
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "policy insert failed");
    return data as FinancialPolicyRow;
}

export type FinancialPolicyVersionInput = {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    label?: string | null;
    description?: string | null;
    value?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export type FinancialPolicyVersionResult = {
    policy: FinancialPolicyRow;
    priorId: string;
    priorCloseDate: string;
};

export async function createFinancialPolicyVersion(
    supabase: SupabaseClient,
    input: FinancialPolicyVersionInput,
): Promise<FinancialPolicyVersionResult> {
    const prior = await getById(supabase, input.orgId, input.priorId);
    const newStart = requireEffectiveStart(input.effectiveStart);
    const actor = trimOrNull(input.actorUserId);
    const value = input.value !== undefined ? validatedValue(prior.policy_type, input.value) : prior.value;

    const plan = planSupersede({ priorStart: prior.effective_start, priorEnd: prior.effective_end, newStart });
    if (!plan.ok) fail(plan.error.code, plan.error.message);
    const closeDate = plan.closeDate;

    const { data: inserted, error: insertError } = await supabase
        .from(TABLE)
        .insert({
            org_id: input.orgId,
            scope_type: prior.scope_type,
            location_id: prior.location_id,
            service_id: prior.service_id,
            rate_plan_id: prior.rate_plan_id,
            policy_type: prior.policy_type,
            label: input.label !== undefined ? trimOrNull(input.label) : prior.label,
            description: input.description !== undefined ? trimOrNull(input.description) : prior.description,
            value,
            is_active: true,
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
        })
        .select("*")
        .single();
    if (insertError || !inserted) fail("db_error", insertError?.message ?? "policy version insert failed");

    const { error: closeError } = await supabase
        .from(TABLE)
        .update({ effective_end: closeDate, updated_by: actor })
        .eq("org_id", input.orgId)
        .eq("id", prior.id);
    if (closeError) fail("db_error", closeError.message);

    return { policy: inserted as FinancialPolicyRow, priorId: prior.id, priorCloseDate: closeDate };
}

export async function retireFinancialPolicy(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; todayYmd: string; actorUserId?: string | null },
): Promise<FinancialPolicyRow> {
    const prior = await getById(supabase, input.orgId, input.id);
    const end = trimOrNull(input.effectiveEnd);
    if (!end) fail("invalid_input", "effectiveEnd is required to retire a policy");
    assertValidIsoDate(end, "effectiveEnd");
    assertValidIsoDate(input.todayYmd, "todayYmd");
    const rangeError = validateEndOnOrAfterStart(prior.effective_start, end);
    if (rangeError) fail("validation_failed", rangeError.message);
    const actor = trimOrNull(input.actorUserId);

    const update: Record<string, unknown> = { effective_end: end, updated_by: actor };
    if (compareIsoDates(end, input.todayYmd) <= 0) update.is_active = false;

    const { data, error } = await supabase
        .from(TABLE)
        .update(update)
        .eq("org_id", input.orgId)
        .eq("id", input.id)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "policy retire failed");
    return data as FinancialPolicyRow;
}

export type VoidResult = { voided: true; id: string; reopenedPriorId: string | null };

function sameLineage(a: FinancialPolicyRow, b: FinancialPolicyRow): boolean {
    return (
        a.policy_type === b.policy_type &&
        a.scope_type === b.scope_type &&
        (a.location_id ?? null) === (b.location_id ?? null) &&
        (a.service_id ?? null) === (b.service_id ?? null) &&
        (a.rate_plan_id ?? null) === (b.rate_plan_id ?? null)
    );
}

export async function voidScheduledFinancialPolicy(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
): Promise<VoidResult> {
    const policy = await getById(supabase, input.orgId, input.id);
    assertValidIsoDate(input.todayYmd, "todayYmd");
    if (compareIsoDates(policy.effective_start, input.todayYmd) <= 0) {
        fail("invalid_state", "Only a scheduled (future) version can be voided; retire an active version instead");
    }
    const all = await listFinancialPolicies(supabase, input.orgId);
    const hasLater = all.some(
        (p) => p.id !== policy.id && sameLineage(p, policy) && compareIsoDates(p.effective_start, policy.effective_start) > 0,
    );
    if (hasLater) fail("invalid_state", "Cannot void a version that has a later version");
    const actor = trimOrNull(input.actorUserId);

    const supersedesId = asMetadata(policy.metadata).supersedes_id;
    let reopenedPriorId: string | null = null;
    if (typeof supersedesId === "string" && supersedesId.length > 0) {
        const { error } = await supabase
            .from(TABLE)
            .update({ effective_end: null, updated_by: actor })
            .eq("org_id", input.orgId)
            .eq("id", supersedesId);
        if (error) fail("db_error", error.message);
        reopenedPriorId = supersedesId;
    }

    const { error: deleteError } = await supabase.from(TABLE).delete().eq("org_id", input.orgId).eq("id", input.id);
    if (deleteError) fail("db_error", deleteError.message);
    return { voided: true, id: input.id, reopenedPriorId };
}
