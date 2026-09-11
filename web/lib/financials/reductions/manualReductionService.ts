/**
 * A REDUCTION SOMEBODY DECIDED — and the record that says who, why, and against what.
 *
 * Policy reductions explain themselves: the policy is the reason. A manual credit, waiver or
 * write-off has no policy behind it, so the reason IS the record. The table's CHECK refuses a
 * manual application without one, and this service refuses it earlier, with a message an operator
 * can act on.
 *
 * ── ONE ENGINE, TWO PROVENANCES ──
 *
 * The persistence itself — idempotency, the contra charge, posted protection, the unique-key race —
 * is not manual-specific and lives in `reductionCore`. What stays here is what makes a reduction
 * MANUAL: a reason somebody has to give, a category, and the rule that no policy may be named on a
 * decision no policy made. A repeat of a manual credit returns what was already recorded rather
 * than re-pricing it: submitting a form twice is one credit, not an instruction to recalculate.
 *
 * ── UNDOING ONE APPENDS ──
 *
 * There is no UPDATE and no DELETE here. Reversing a manual reduction writes a NEW charge in the
 * opposite direction and a NEW application row pointing back at the original — the same shape
 * Thread 1's correction lineage already uses, so a ledger reads the same way whether the thing
 * being undone was a charge or a credit. A reduction is reversed once; the reversal is not itself
 * reversed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyReductionCore, ReductionCoreError } from "@/lib/financials/reductions/reductionCore";

/** The categories a manual reduction may post through — all code-owned taxonomy. */
export const MANUAL_REDUCTION_CATEGORIES = ["credit", "adjustment", "discount"] as const;
export type ManualReductionCategory = (typeof MANUAL_REDUCTION_CATEGORIES)[number];

export class ManualReductionError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export type ManualReductionInput = {
    orgId: string;
    enrollmentAgreementId: string;
    customerId?: string | null;
    customerMemberId?: string | null;
    chargeCategory: ManualReductionCategory;
    /** SIGNED cents. Negative reduces what the family owes; positive is a correction back. */
    amountCents: number;
    currencyCode?: string | null;
    reason: string;
    /** The date the reduction belongs to — the period it lands in, not the day it was typed. */
    effectiveDate: string;
    periodKey?: string | null;
    sourceChargeId?: string | null;
    note?: string | null;
    actorUserId: string | null;
    /** Caller-supplied identity, so a double-submit is one credit. */
    idempotencyKey: string;
};

export type ManualReductionResult = {
    applicationId: string;
    chargeId: string;
    amountCents: number;
    /** True when this call found the reduction already recorded and wrote nothing. */
    idempotent: boolean;
};

function requireReason(reason: string): string {
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < 3) {
        throw new ManualReductionError(
            "reason_required",
            "Say why the account is being reduced. A manual credit with no reason cannot be explained later.",
        );
    }
    return trimmed;
}

export async function applyManualReduction(
    supabase: SupabaseClient,
    input: ManualReductionInput,
): Promise<ManualReductionResult> {
    const reason = requireReason(input.reason);
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
        throw new ManualReductionError("invalid_amount", "A reduction needs a whole, non-zero amount in cents.");
    }
    if (!(MANUAL_REDUCTION_CATEGORIES as readonly string[]).includes(input.chargeCategory)) {
        throw new ManualReductionError("invalid_category", `Unknown reduction category: ${input.chargeCategory}.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
        throw new ManualReductionError("invalid_effective_date", "Name the date this reduction takes effect.");
    }

    try {
        const result = await applyReductionCore(supabase, {
            orgId: input.orgId,
            actorUserId: input.actorUserId,
            subject: {
                enrollmentAgreementId: input.enrollmentAgreementId,
                customerId: input.customerId ?? null,
                customerMemberId: input.customerMemberId ?? null,
                sourceChargeId: input.sourceChargeId ?? null,
                periodKey: input.periodKey ?? input.effectiveDate.slice(0, 7),
            },
            charge: {
                chargeCategory: input.chargeCategory,
                description: input.chargeCategory,
                serviceDate: input.effectiveDate,
                currencyCode: input.currencyCode ?? "USD",
                metadata: {
                    source: "manual_reduction",
                    reason,
                    note: input.note ?? null,
                    reduces_charge_id: input.sourceChargeId ?? null,
                },
            },
            applications: [{
                reductionKind: "manual",
                reason,
                explanation: input.note ?? null,
                amountCents: input.amountCents,
                idempotencyKey: input.idempotencyKey,
            }],
            // A manual credit submitted twice is one credit. The second submission is not an
            // instruction to re-price the first.
            onExisting: "return",
        });
        return {
            applicationId: result.applicationIds[0]!,
            chargeId: result.chargeId,
            amountCents: result.amountCents,
            idempotent: result.kind !== "applied",
        };
    } catch (error) {
        if (error instanceof ReductionCoreError) {
            throw new ManualReductionError(error.code, error.message);
        }
        throw error;
    }
}

/**
 * Reverse a manual reduction by appending its opposite. The original is left exactly as it was —
 * that is the point.
 */
export async function reverseManualReduction(
    supabase: SupabaseClient,
    input: { orgId: string; applicationId: string; reason: string; actorUserId: string | null },
): Promise<ManualReductionResult> {
    const reason = requireReason(input.reason);
    const { data: originalRow, error: readError } = await supabase
        .from("financial_reduction_applications")
        .select("id, org_id, reduction_kind, charge_id, source_charge_id, customer_id, customer_member_id, enrollment_agreement_id, period_key, amount_cents, currency_code, reversed_by_id")
        .eq("org_id", input.orgId)
        .eq("id", input.applicationId)
        .maybeSingle();
    if (readError) throw new ManualReductionError("db_error", readError.message);
    if (!originalRow) throw new ManualReductionError("not_found", "No such reduction on this account.");
    const original = originalRow as {
        id: string;
        reduction_kind: string;
        charge_id: string;
        source_charge_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        enrollment_agreement_id: string | null;
        period_key: string | null;
        amount_cents: number;
        currency_code: string;
        reversed_by_id: string | null;
    };
    // ONE reversal. A second would credit the family twice for one decision — the same bound
    // Thread 1 enforces on a posted charge's correction.
    if (original.reversed_by_id) {
        throw new ManualReductionError("already_reversed", "This reduction has already been reversed.");
    }
    if (!original.enrollment_agreement_id) {
        throw new ManualReductionError("invalid_input", "The original reduction has no billable source to reverse against.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const reversal = await applyManualReduction(supabase, {
        orgId: input.orgId,
        enrollmentAgreementId: original.enrollment_agreement_id,
        customerId: original.customer_id,
        customerMemberId: original.customer_member_id,
        chargeCategory: "adjustment",
        amountCents: -original.amount_cents,
        currencyCode: original.currency_code,
        reason,
        effectiveDate: today,
        periodKey: original.period_key,
        sourceChargeId: original.charge_id,
        actorUserId: input.actorUserId,
        idempotencyKey: `fred:reverse:${original.id}`,
    });

    await supabase
        .from("financial_reduction_applications")
        .update({ reverses_id: original.id, updated_by: input.actorUserId })
        .eq("org_id", input.orgId)
        .eq("id", reversal.applicationId);
    await supabase
        .from("financial_reduction_applications")
        .update({ reversed_by_id: reversal.applicationId, updated_by: input.actorUserId, updated_at: new Date().toISOString() })
        .eq("org_id", input.orgId)
        .eq("id", original.id);

    return reversal;
}
