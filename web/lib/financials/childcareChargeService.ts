/**
 * Childcare charge service (P3.1) — server-side financial write posture.
 *
 * The safe, role-aware write surface for childcare charges on the SHARED `charges`
 * table, addressed through the generic billable-source dimension. A childcare
 * source is `enrollment_agreement` OR `customer` — an enrolled child's charge hangs
 * off their agreement, a family's pre-enrolment fee off the household — and every
 * rule below quantifies over that SET rather than one of its members.
 *
 * Invariants (DB triggers/constraints are authoritative; these mirror them for
 * friendly errors):
 *   - Childcare charges carry a childcare billable_source_type + billable_source_id;
 *     job_id is NULL.
 *   - Draft charges are freely recalculable.
 *   - Posted charges are immutable: corrections are NEW rows via source_charge_id
 *     (reversal / credit / replacement), never in-place edits.
 *   - Posting is IDEMPOTENT: posting an already-posted charge returns it and writes
 *     nothing, so a retried request cannot post twice.
 *   - A posted charge is corrected ONCE: it admits no second reversal, and a correction is
 *     never itself corrected.
 *   - Every write is actor-attributed (`created_by` / `updated_by` / `posted_by`).
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
    CHILDCARE_BILLABLE_SOURCE_TYPES,
    DEFAULT_CURRENCY_CODE,
    isChargeCategory,
    isChildcareBillableSource,
    isPostedStatus,
    type ChargeCategory,
} from "@/lib/financials/billableSource";
import type { ChargeIntent } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";

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
    /** Actor attribution. `posted_by` is the actor of the authoritative money transition. */
    created_by: string | null;
    updated_by: string | null;
    posted_by: string | null;
};

const BILLABLE_SOURCE_ENROLLMENT = "enrollment_agreement" as const;

export type CreateChildcareDraftChargeInput = {
    orgId: string;
    enrollmentAgreementId: string;
    /** The operator making the write. Recorded as `created_by`; null for system writes. */
    actorUserId?: string | null;
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
    /** The operator making the write. Recorded as `updated_by`; null for system writes. */
    actorUserId?: string | null;
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
    /** The operator recording the correction. Corrections are posted money, so this is `posted_by` too. */
    actorUserId?: string | null;
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

/**
 * D12a PLANNING helper (no write). Given a superseded obligation's DRAFT charge id,
 * produce the retirement intent the reconciliation plan carries. The actual write
 * (draft -> void in place, DP-2) happens atomically inside the
 * reconcile_consumption_correction RPC — never here. Charge-domain knowledge (the
 * retirement reason + that only DRAFT charges are retired) stays in this service.
 */
export type DraftChargeRetirementIntent = {
    draftChargeId: string;
    reason: "obligation_superseded";
};

export function buildDraftChargeRetirementIntent(draftChargeId: string): DraftChargeRetirementIntent {
    return { draftChargeId, reason: "obligation_superseded" };
}

/**
 * The priced childcare DRAFT-charge FIELDS the correction reconciliation plan carries.
 * Financials-owned shape: what a childcare draft charge IS (the enrollment-agreement
 * billable-source dimension, category, provenance metadata). Operational Consumption
 * only orchestrates WHEN a charge is (re)written during reconciliation; the
 * create-vs-recalc decision and the atomic write live in reconcile_consumption_correction
 * UNDER LOCK (never a pre-lock plan hint). No pricing here — `intent` is already priced
 * by the charge-template resolver. (Audit F2: restore the charge-semantics ownership boundary.)
 */
export type ChildcareDraftChargeFields = {
    billableSourceType: string;
    billableSourceId: string | null;
    chargeType: string;
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

export function buildChildcareDraftChargeFields(
    intent: ChargeIntent,
    agreementId: string,
): ChildcareDraftChargeFields {
    return {
        billableSourceType: BILLABLE_SOURCE_ENROLLMENT,
        billableSourceId: agreementId,
        chargeType: "fee",
        chargeCategory: intent.chargeCategory,
        currencyCode: intent.currencyCode,
        amountCents: intent.amountCents,
        serviceDate: intent.occursOn,
        occursOn: intent.occursOn,
        billableOn: intent.billableOn,
        chargeTemplateId: intent.templateId,
        serviceId: intent.serviceId,
        description: intent.templateKey,
        metadata: {
            resolution_key: intent.resolutionKey,
            charge_template_key: intent.templateKey,
            gl_mapping_key: intent.glMappingKey,
            responsibility_key: intent.responsibilityKey,
            review_required: intent.reviewRequired,
            lifecycle_status: intent.lifecycleStatus,
            source: "charge_template",
        },
    };
}

async function loadCharge(
    supabase: SupabaseClient,
    orgId: string,
    chargeId: string
): Promise<ChargeRow> {
    const { data, error } = await supabase
        .from("charges")
        .select(
            "id, org_id, job_id, source_charge_id, billable_source_type, billable_source_id, charge_type, charge_category, status, currency_code, amount_cents, service_date, due_date, posted_at, voided_at, description, metadata, created_at, updated_at, created_by, updated_by, posted_by"
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

/**
 * This service governs CHILDCARE money — every childcare billable source, not one of them.
 *
 * It used to test the `enrollment_agreement` literal, which meant a household charge (a waitlist,
 * registration or application fee incurred before anyone is enrolled) could be created by Add Charge
 * and then never posted or corrected: the two transitions that make a charge real both refused it.
 * The set is the vocabulary's, so a source the substrate admits is a source this service governs.
 */
function assertChildcareCharge(charge: ChargeRow): void {
    if (!isChildcareBillableSource(charge.billable_source_type)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `this service only governs childcare charges (${CHILDCARE_BILLABLE_SOURCE_TYPES.join(" | ")}); `
                + "job charges use the job billing path"
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
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
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

    const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: input.actorUserId ?? null,
    };
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

export type PostChildcareChargeResult = {
    charge: ChargeRow;
    /**
     * False when this call performed the posting; true when the charge was ALREADY posted and
     * nothing was written. The caller can tell "I posted it" from "it was posted" without either
     * answer being an error.
     */
    alreadyPosted: boolean;
};

/**
 * Post a DRAFT childcare charge (draft -> posted). After this it is immutable.
 *
 * ── POSTING IS IDEMPOTENT ──
 *
 * A retried request — a double click, a network retry, a resubmitted form — must not be able to post
 * twice, and must not present the second attempt as a failure. This used to raise `invalid_state` on
 * an already-posted charge, which made the harmless case indistinguishable from a real conflict and
 * pushed every caller into guessing. The transition is guarded by `status = 'draft'` IN THE UPDATE
 * ITSELF, so two concurrent posts race on the row and exactly one of them writes: the loser sees
 * zero rows updated, re-reads, and reports `alreadyPosted`. The read-then-write pair alone would not
 * have been enough.
 */
export async function postChildcareCharge(
    supabase: SupabaseClient,
    input: { orgId: string; chargeId: string; actorUserId?: string | null }
): Promise<PostChildcareChargeResult> {
    const charge = await loadCharge(supabase, input.orgId, input.chargeId);
    assertChildcareCharge(charge);
    if (isPostedStatus(charge.status)) {
        return { charge, alreadyPosted: true };
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("charges")
        .update({
            status: "posted",
            posted_at: now,
            posted_by: input.actorUserId ?? null,
            updated_at: now,
            updated_by: input.actorUserId ?? null,
        })
        .eq("org_id", input.orgId)
        .eq("id", input.chargeId)
        // The transition guard. Without it, two concurrent posts both pass the read above.
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    if (!data) {
        // Someone else won the race. Their posting is the one that stands.
        return { charge: await loadCharge(supabase, input.orgId, input.chargeId), alreadyPosted: true };
    }
    return { charge: data as ChargeRow, alreadyPosted: false };
}

/**
 * The LIVE reversal of a charge, if one exists.
 *
 * `status <> 'void'` and `metadata.correction_kind = 'reversal'` are the same predicate the partial
 * unique index uses, so the friendly refusal and the authoritative one describe the same row. A
 * voided correction is not a correction that stands.
 */
async function findLiveReversal(
    supabase: SupabaseClient,
    orgId: string,
    sourceChargeId: string
): Promise<{ id: string } | null> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, status, metadata")
        .eq("org_id", orgId)
        .eq("source_charge_id", sourceChargeId);
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    const rows = (data ?? []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
    const reversal = rows.find(
        (r) => r.status !== "void" && (r.metadata ?? {}).correction_kind === "reversal"
    );
    return reversal ? { id: reversal.id } : null;
}

/**
 * Create a correction for a posted childcare charge as a NEW row referencing the
 * original via source_charge_id. Never mutates the original.
 *   - reversal: negation of the source amount (amountCents must be omitted).
 *   - credit / replacement: explicit signed amount.
 *
 * ── A CHARGE IS CORRECTED ONCE ──
 *
 * The correction path shipped with no bound, and an unbounded correction invents money: reversing a
 * $1,300 charge twice leaves the family owed $1,300 they were never charged, and a reversal — being
 * posted money itself — could be reversed in turn without end. The rule is asserted by the database
 * (`20260902140000`: the lineage trigger plus a partial unique index that two concurrent reversals
 * cannot both pass). These checks mirror it so an operator reads a sentence rather than a
 * constraint name.
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

    // A correction is recorded against the ORIGINAL charge. Correcting a correction reinstates a
    // charge as a side effect and starts a chain with no terminus; a charge that should stand again
    // is re-billed as its own charge, which leaves a record of that decision.
    if (source.source_charge_id) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `charge ${source.id} is itself a correction of ${source.source_charge_id}; `
                + "record the correction against the original charge"
        );
    }

    // Once reversed, the charge no longer stands, so it admits no further correction of any kind —
    // a second reversal credits the family twice, and a credit against money already removed in
    // full removes it again.
    const existingReversal = await findLiveReversal(supabase, input.orgId, source.id);
    if (existingReversal) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `charge ${source.id} has already been reversed by ${existingReversal.id} and admits no further correction`
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
            // The SOURCE's own attribution, not a hardcoded one: a household charge is corrected on
            // the household, never re-pinned onto an agreement it never belonged to.
            billable_source_type: source.billable_source_type,
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
            // A correction is posted money the moment it is written, so its author is its poster.
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
            posted_by: input.actorUserId ?? null,
        })
        .select("*")
        .single();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data as ChargeRow;
}
