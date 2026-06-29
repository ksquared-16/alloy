/**
 * Charge Template authoring (Commercial Model, Slice B) — versioned,
 * effective-dated configuration writes. Mirrors the rate-plan / config-rule
 * supersede discipline: "edit" = new version row + prior effective_end closed the
 * day before; never an in-place overwrite of value fields.
 *
 * Configuration ONLY. Charge Templates define how a fact/event becomes a charge;
 * they post nothing, write no ledger/GL, and create no invoices/payments. Posting
 * remains the only authoritative money write (financial-platform-domain.md).
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
    isAmountStrategy,
    isBillableOn,
    isChargeCategory,
    isOccursOn,
    isTriggerType,
    type ChargeTemplateRow,
} from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

const TABLE = "financial_charge_templates";

type Code = OperationalEnrollmentServiceError["code"];
function fail(code: Code, message: string, details?: Record<string, unknown>): never {
    throw new OperationalEnrollmentServiceError(code, message, details);
}
function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function lineageOriginOf(metadata: Record<string, unknown>, ownId: string): string {
    const origin = metadata.lineage_origin_id;
    return typeof origin === "string" && origin.length > 0 ? origin : ownId;
}

export type ChargeTemplateValueInput = {
    serviceId?: string | null;
    label: string;
    description?: string | null;
    chargeCategory: string;
    triggerType: string;
    triggerKey?: string | null;
    amountStrategy: string;
    amountCents?: number | null;
    currencyCode?: string | null;
    occursOnStrategy?: string | null;
    billableOnStrategy?: string | null;
    billableOffsetDays?: number | null;
    defaultGlMappingKey?: string | null;
    defaultResponsibilityKey?: string | null;
    reviewRequired?: boolean;
};

/** Validate the template value columns (pure-ish; throws on invalid). */
function buildValueColumns(input: ChargeTemplateValueInput): Record<string, unknown> {
    const label = trimOrNull(input.label);
    if (!label) fail("invalid_input", "Template label is required");
    if (!isChargeCategory(input.chargeCategory)) fail("invalid_input", "chargeCategory is invalid");
    if (!isTriggerType(input.triggerType)) fail("invalid_input", "triggerType is invalid");
    if (!isAmountStrategy(input.amountStrategy)) fail("invalid_input", "amountStrategy is invalid");

    const occursOn = trimOrNull(input.occursOnStrategy) ?? "now";
    if (!isOccursOn(occursOn)) fail("invalid_input", "occursOnStrategy is invalid");
    const billableOn = trimOrNull(input.billableOnStrategy) ?? "immediate";
    if (!isBillableOn(billableOn)) fail("invalid_input", "billableOnStrategy is invalid");

    // amount shape: fixed requires a non-negative amount; others must omit it.
    let amountCents: number | null = null;
    if (input.amountStrategy === "fixed") {
        if (input.amountCents == null || input.amountCents === ("" as unknown)) {
            fail("invalid_input", "A fixed template requires an amount");
        }
        const n = Number(input.amountCents);
        if (!Number.isInteger(n) || n < 0) fail("invalid_input", "A fixed template requires a non-negative amount");
        amountCents = n;
    }

    // offset shape: offset_days requires a non-negative offset; others must omit it.
    let offsetDays: number | null = null;
    if (billableOn === "offset_days") {
        if (input.billableOffsetDays == null || input.billableOffsetDays === ("" as unknown)) {
            fail("invalid_input", "Billable 'after N days' requires an offset");
        }
        const n = Number(input.billableOffsetDays);
        if (!Number.isInteger(n) || n < 0) fail("invalid_input", "Billable 'after N days' requires a non-negative offset");
        offsetDays = n;
    }

    return {
        service_id: trimOrNull(input.serviceId),
        label,
        description: trimOrNull(input.description),
        charge_category: input.chargeCategory,
        trigger_type: input.triggerType,
        trigger_key: trimOrNull(input.triggerKey),
        amount_strategy: input.amountStrategy,
        amount_cents: amountCents,
        currency_code: (trimOrNull(input.currencyCode) ?? "USD").toUpperCase(),
        occurs_on_strategy: occursOn,
        billable_on_strategy: billableOn,
        billable_offset_days: offsetDays,
        default_gl_mapping_key: trimOrNull(input.defaultGlMappingKey),
        default_responsibility_key: trimOrNull(input.defaultResponsibilityKey),
        review_required: input.reviewRequired === true,
    };
}

function requireEffectiveStart(value: unknown): string {
    const v = trimOrNull(value);
    if (!v) fail("invalid_input", "effectiveStart is required");
    assertValidIsoDate(v, "effectiveStart");
    return v;
}

async function getById(supabase: SupabaseClient, orgId: string, id: string): Promise<ChargeTemplateRow> {
    const { data, error } = await supabase.from(TABLE).select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) fail("db_error", error.message);
    if (!data) fail("not_found", "Charge template not found", { id });
    return data as ChargeTemplateRow;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listChargeTemplates(supabase: SupabaseClient, orgId: string): Promise<ChargeTemplateRow[]> {
    const { data, error } = await supabase.from(TABLE).select("*").eq("org_id", orgId);
    if (error) fail("db_error", error.message);
    return (data ?? []) as ChargeTemplateRow[];
}

// ---------------------------------------------------------------------------
// Create / version / retire / void
// ---------------------------------------------------------------------------

export type CreateChargeTemplateInput = ChargeTemplateValueInput & {
    orgId: string;
    templateKey: string;
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createChargeTemplate(
    supabase: SupabaseClient,
    input: CreateChargeTemplateInput,
): Promise<ChargeTemplateRow> {
    const templateKey = trimOrNull(input.templateKey);
    if (!templateKey) fail("invalid_input", "templateKey is required");
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
            template_key: templateKey,
            ...buildValueColumns(input),
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
    if (error || !data) fail("db_error", error?.message ?? "charge template insert failed");
    return data as ChargeTemplateRow;
}

export type ChargeTemplateVersionInput = ChargeTemplateValueInput & {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export type ChargeTemplateVersionResult = {
    template: ChargeTemplateRow;
    priorId: string;
    priorCloseDate: string;
};

export async function createChargeTemplateVersion(
    supabase: SupabaseClient,
    input: ChargeTemplateVersionInput,
): Promise<ChargeTemplateVersionResult> {
    const prior = await getById(supabase, input.orgId, input.priorId);
    const newStart = requireEffectiveStart(input.effectiveStart);
    const actor = trimOrNull(input.actorUserId);

    const plan = planSupersede({ priorStart: prior.effective_start, priorEnd: prior.effective_end, newStart });
    if (!plan.ok) fail(plan.error.code, plan.error.message);
    const closeDate = plan.closeDate;

    const { data: inserted, error: insertError } = await supabase
        .from(TABLE)
        .insert({
            org_id: input.orgId,
            template_key: prior.template_key,
            ...buildValueColumns(input),
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
    if (insertError || !inserted) fail("db_error", insertError?.message ?? "charge template version insert failed");

    const { error: closeError } = await supabase
        .from(TABLE)
        .update({ effective_end: closeDate, updated_by: actor })
        .eq("org_id", input.orgId)
        .eq("id", prior.id);
    if (closeError) fail("db_error", closeError.message);

    return { template: inserted as ChargeTemplateRow, priorId: prior.id, priorCloseDate: closeDate };
}

export async function retireChargeTemplate(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; todayYmd: string; actorUserId?: string | null },
): Promise<ChargeTemplateRow> {
    const prior = await getById(supabase, input.orgId, input.id);
    const end = trimOrNull(input.effectiveEnd);
    if (!end) fail("invalid_input", "effectiveEnd is required to retire a template");
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
    if (error || !data) fail("db_error", error?.message ?? "charge template retire failed");
    return data as ChargeTemplateRow;
}

export type VoidResult = { voided: true; id: string; reopenedPriorId: string | null };

export async function voidScheduledChargeTemplate(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
): Promise<VoidResult> {
    const tpl = await getById(supabase, input.orgId, input.id);
    assertValidIsoDate(input.todayYmd, "todayYmd");
    if (compareIsoDates(tpl.effective_start, input.todayYmd) <= 0) {
        fail("invalid_state", "Only a scheduled (future) version can be voided; retire an active version instead");
    }
    // Guard: no later sibling in the same lineage (template_key).
    const all = await listChargeTemplates(supabase, input.orgId);
    const hasLater = all.some(
        (t) => t.id !== tpl.id && t.template_key === tpl.template_key && compareIsoDates(t.effective_start, tpl.effective_start) > 0,
    );
    if (hasLater) fail("invalid_state", "Cannot void a version that has a later version");
    const actor = trimOrNull(input.actorUserId);

    const supersedesId = asMetadata(tpl.metadata).supersedes_id;
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
