/**
 * Childcare charge service (P3.1) — server-side financial write posture.
 *
 * Generalized substrate plumbing only. This is NOT Charge Resolution or Posting
 * (those arrive in later P3 batches); it provides the safe, role-aware write
 * surface for childcare charges on the SHARED `charges` table using the generic
 * billable-source dimension (`billable_source_type = 'enrollment_agreement'`).
 *
 * Invariants (DB triggers/constraints are authoritative; these mirror them for
 * friendly errors):
 *   - Childcare charges always carry billable_source_type='enrollment_agreement'
 *     and billable_source_id=<agreement id>; job_id is NULL.
 *   - Draft charges are freely recalculable.
 *   - Posted charges are immutable: corrections are NEW rows via source_charge_id
 *     (reversal / credit / replacement), never in-place edits.
 *
 * Posture: callers MUST pass a server-only Supabase client (service-role admin
 * client). There is no broad authenticated client write path for childcare
 * money; DB RLS additionally role-gates childcare rows (has_org_role).
 *
 * Doctrine: docs/platform/modules/billing-financials-platform.md
 *           ("Ratified P3.1 implementation gates").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    DEFAULT_CURRENCY_CODE,
    isChargeCategory,
    isPostedStatus,
    type ChargeCategory,
} from "@/lib/financials/billableSource";

/** Subset of the charges row this service reads/writes. */
export type ChargeRow = {
    id: string;
    org_id: string;
    job_id: string | null;
    source_charge_id: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
    charge_type: string;
    charge_category: string | null;
    status: string;
    currency_code: string;
    amount_cents: number;
    service_date: string | null;
    due_date: string | null;
    posted_at: string | null;
    voided_at: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

const BILLABLE_SOURCE_ENROLLMENT = "enrollment_agreement" as const;

export type CreateChildcareDraftChargeInput = {
    orgId: string;
    enrollmentAgreementId: string;
    /** Frozen legacy taxonomy; defaults to 'service'. Use chargeCategory for meaning. */
    chargeType?: string;
    chargeCategory: ChargeCategory;
    amountCents: number;
    currencyCode?: string;
    serviceDate?: string | null;
    dueDate?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
};

export type RecalculateDraftChargeInput = {
    orgId: string;
    chargeId: string;
    amountCents?: number;
    chargeCategory?: ChargeCategory;
    serviceDate?: string | null;
    dueDate?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
};

export type CorrectionKind = "reversal" | "credit" | "replacement";

export type CreateChildcareCorrectionInput = {
    orgId: string;
    /** The posted charge being corrected. */
    sourceChargeId: string;
    kind: CorrectionKind;
    /**
     * For 'credit'/'replacement' the explicit signed amount (cents). For
     * 'reversal' the amount is derived as the negation of the source and must be
     * omitted.
     */
    amountCents?: number;
    chargeCategory?: ChargeCategory;
    description?: string | null;
    metadata?: Record<string, unknown>;
};

function assertAmountNonZeroInt(amount: number, field = "amountCents"): void {
    if (!Number.isInteger(amount) || amount === 0) {
        throw new OperationalEnrollmentServiceError("invalid_input", `${field} must be a non-zero integer (cents)`);
    }
}

function assertChargeCategory(value: unknown): asserts value is ChargeCategory {
    if (!isChargeCategory(value)) {
        throw new OperationalEnrollmentServiceError("invalid_input", `invalid charge_category: ${String(value)}`);
    }
}

async function loadCharge(
    supabase: SupabaseClient,
    orgId: string,
    chargeId: string
): Promise<ChargeRow> {
    const { data, error } = await supabase
        .from("charges")
        .select(
            "id, org_id, job_id, source_charge_id, billable_source_type, billable_source_id, charge_type, charge_category, status, currency_code, amount_cents, service_date, due_date, posted_at, voided_at, description, metadata, created_at, updated_at"
        )
        .eq("org_id", orgId)
        .eq("id", chargeId)
        .maybeSingle();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    if (!data) {
        throw new OperationalEnrollmentServiceError("not_found", `charge ${chargeId} not found`);
    }
    return data as ChargeRow;
}

function assertChildcareCharge(charge: ChargeRow): void {
    if (charge.billable_source_type !== BILLABLE_SOURCE_ENROLLMENT) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "this service only governs childcare (enrollment_agreement) charges; job charges use the job billing path"
        );
    }
}

/** Create a new DRAFT childcare charge on the shared substrate. */
export async function createChildcareDraftCharge(
    supabase: SupabaseClient,
    input: CreateChildcareDraftChargeInput
): Promise<ChargeRow> {
    const agreementId = trimOrNull(input.enrollmentAgreementId);
    if (!trimOrNull(input.orgId) || !agreementId) {
        throw new OperationalEnrollmentServiceError("invalid_input", "orgId and enrollmentAgreementId are required");
    }
    assertChargeCategory(input.chargeCategory);
    assertAmountNonZeroInt(input.amountCents);

    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("charges")
        .insert({
            org_id: input.orgId,
            job_id: null,
            billable_source_type: BILLABLE_SOURCE_ENROLLMENT,
            billable_source_id: agreementId,
            source_charge_id: null,
            charge_type: trimOrNull(input.chargeType) ?? "service",
            charge_category: input.chargeCategory,
            status: "draft",
            currency_code: trimOrNull(input.currencyCode) ?? DEFAULT_CURRENCY_CODE,
            amount_cents: input.amountCents,
            service_date: input.serviceDate ?? null,
            due_date: input.dueDate ?? null,
            posted_at: null,
            voided_at: null,
            description: trimOrNull(input.description),
            metadata: input.metadata ?? {},
            updated_at: now,
        })
        .select("*")
        .single();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data as ChargeRow;
}

/** Recalculate a DRAFT childcare charge in place. Posted charges are rejected. */
export async function recalculateDraftCharge(
    supabase: SupabaseClient,
    input: RecalculateDraftChargeInput
): Promise<ChargeRow> {
    const charge = await loadCharge(supabase, input.orgId, input.chargeId);
    assertChildcareCharge(charge);
    if (isPostedStatus(charge.status)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "posted childcare charge cannot be recalculated in place; record a reversal/credit/replacement via source_charge_id"
        );
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.amountCents !== undefined) {
        assertAmountNonZeroInt(input.amountCents);
        patch.amount_cents = input.amountCents;
    }
    if (input.chargeCategory !== undefined) {
        assertChargeCategory(input.chargeCategory);
        patch.charge_category = input.chargeCategory;
    }
    if (input.serviceDate !== undefined) patch.service_date = input.serviceDate;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.description !== undefined) patch.description = trimOrNull(input.description);
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const { data, error } = await supabase
        .from("charges")
        .update(patch)
        .eq("org_id", input.orgId)
        .eq("id", input.chargeId)
        .select("*")
        .single();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data as ChargeRow;
}

/** Post a DRAFT childcare charge (draft -> posted). After this it is immutable. */
export async function postChildcareCharge(
    supabase: SupabaseClient,
    input: { orgId: string; chargeId: string }
): Promise<ChargeRow> {
    const charge = await loadCharge(supabase, input.orgId, input.chargeId);
    assertChildcareCharge(charge);
    if (isPostedStatus(charge.status)) {
        throw new OperationalEnrollmentServiceError("invalid_state", "charge is already posted");
    }
    const { data, error } = await supabase
        .from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("org_id", input.orgId)
        .eq("id", input.chargeId)
        .select("*")
        .single();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data as ChargeRow;
}

/**
 * Create a correction for a posted childcare charge as a NEW row referencing the
 * original via source_charge_id. Never mutates the original.
 *   - reversal: negation of the source amount (amountCents must be omitted).
 *   - credit / replacement: explicit signed amount.
 */
export async function createChildcareCorrection(
    supabase: SupabaseClient,
    input: CreateChildcareCorrectionInput
): Promise<ChargeRow> {
    const source = await loadCharge(supabase, input.orgId, input.sourceChargeId);
    assertChildcareCharge(source);
    if (!isPostedStatus(source.status)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "only posted childcare charges are corrected via source_charge_id; recalculate the draft instead"
        );
    }

    let amountCents: number;
    if (input.kind === "reversal") {
        if (input.amountCents !== undefined) {
            throw new OperationalEnrollmentServiceError("invalid_input", "reversal amount is derived; omit amountCents");
        }
        amountCents = -source.amount_cents;
    } else {
        if (input.amountCents === undefined) {
            throw new OperationalEnrollmentServiceError("invalid_input", `${input.kind} requires an explicit amountCents`);
        }
        assertAmountNonZeroInt(input.amountCents);
        amountCents = input.amountCents;
    }

    const defaultCategory: ChargeCategory =
        input.kind === "reversal" ? "credit" : input.kind === "credit" ? "credit" : "adjustment";
    const category = input.chargeCategory ?? defaultCategory;
    assertChargeCategory(category);

    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("charges")
        .insert({
            org_id: input.orgId,
            job_id: null,
            billable_source_type: BILLABLE_SOURCE_ENROLLMENT,
            billable_source_id: source.billable_source_id,
            source_charge_id: source.id,
            charge_type: source.charge_type,
            charge_category: category,
            status: "posted",
            currency_code: source.currency_code,
            amount_cents: amountCents,
            service_date: source.service_date,
            due_date: source.due_date,
            posted_at: now,
            voided_at: null,
            description:
                trimOrNull(input.description) ??
                `${input.kind} of charge ${source.id}`,
            metadata: { ...(input.metadata ?? {}), correction_kind: input.kind, source_charge_id: source.id },
            updated_at: now,
        })
        .select("*")
        .single();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data as ChargeRow;
}
