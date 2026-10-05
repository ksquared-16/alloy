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
import { resolveChargeCustomerId } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import { resolveCustomerCalendar } from "@/lib/financials/billingPeriods/customerBillingPeriodService";
import { currentAndNextPeriods } from "@/lib/financials/billingPeriods/customerBillingPeriodService";
import { legacyMonthlyPeriodKey } from "@/lib/financials/billingPeriod";
import { resolveCorrectionDueDate } from "@/lib/financials/corrections/prospectiveCorrection";

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


/**
 * A REDUCTION MAY NOT TAKE MORE THAN THE OBLIGATION HOLDS.
 *
 * `resolveAllocatableNet` refuses to net an obligation below zero — "the honest move is to refuse
 * rather than allocate a negative obligation between people" — and its own comment says that state
 * is unreachable, because the policy path clamps its aggregate at zero. The MANUAL path never
 * clamped and never bounded, so an operator could write a credit larger than the charge it names and
 * leave that obligation in a state one authority refuses to read while others go on reporting it.
 * The writer now holds the same bound the reader does, which is what makes the reader's refusal
 * genuinely unreachable rather than merely undocumented.
 *
 * Only an ATTACHED reduction is bounded: one that names no obligation reduces none, so there is
 * nothing for it to exceed.
 */
async function assertWithinObligation(supabase: SupabaseClient, input: ManualReductionInput): Promise<void> {
    const sourceChargeId = (input.sourceChargeId ?? "").trim();
    if (!sourceChargeId || input.amountCents >= 0) return;

    const { data: chargeRow, error: chargeError } = await supabase
        .from("charges")
        .select("amount_cents")
        .eq("org_id", input.orgId)
        .eq("id", sourceChargeId)
        .maybeSingle();
    if (chargeError) throw new ManualReductionError("db_error", chargeError.message);
    if (!chargeRow) {
        throw new ManualReductionError("not_found", "No such charge on this account to reduce.");
    }

    const { data: existingRows, error: existingError } = await supabase
        .from("financial_reduction_applications")
        .select("amount_cents, idempotency_key")
        .eq("org_id", input.orgId)
        .eq("source_charge_id", sourceChargeId);
    if (existingError) throw new ManualReductionError("db_error", existingError.message);

    /*
     * A RETRY IS NOT A SECOND REDUCTION. The same idempotency key names the same decision, and
     * counting the row it already wrote would make a harmless resubmit look like an overdraw.
     */
    const already = ((existingRows ?? []) as Array<{ amount_cents: number; idempotency_key: string | null }>)
        .filter((r) => (r.idempotency_key ?? "") !== input.idempotencyKey)
        .reduce((acc, r) => acc + (Number(r.amount_cents) || 0), 0);

    const remaining = (Number((chargeRow as { amount_cents: number }).amount_cents) || 0) + already;
    if (input.amountCents + remaining < 0) {
        throw new ManualReductionError(
            "exceeds_obligation",
            `This reduction is larger than what the charge still holds: ${remaining} cents remain to reduce.`,
        );
    }
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
    await assertWithinObligation(supabase, input);

    /*
     * THE PERIOD KEY IS THE ACCOUNT'S, NOT A MONTH CUT OFF A DATE.
     *
     * This used to be `input.effectiveDate.slice(0, 7)`, which manufactured a MONTHLY identity for
     * every account — including one billing weekly, whose persisted periods carry keys of the shape
     * `2026-11-09~2026-11-15` and never `2026-11`. The key is now the one the customer's canonical
     * calendar actually produces for that date, so a reduction's period label matches a period that
     * exists. An explicitly supplied key still wins; the caller may know better.
     */
    const resolvedPeriod = await resolveManualReductionPeriod(supabase, input);
    const resolvedPeriodKey = input.periodKey ?? resolvedPeriod.key;

    /*
     * ── WHEN AN INCREASE IS DUE ───────────────────────────────────────────────────────────────
     *
     * A manual adjustment that RAISES what a family owes is a collectible obligation like any
     * other, and it was being written with `due_date: null` unconditionally — the reduction path
     * never called the due-date authority at all. A tenant could configure terms, raise $25 through
     * this surface, and have that $25 carry no deadline while every generated charge carried one.
     *
     * It resolves through `resolveCorrectionDueDate`, the SAME function the preview calls, so the
     * date an operator was shown is the date the row carries. The inputs are this correction's own
     * dates — never the source charge's, which is §14's prohibition and would hand the family a
     * deadline that had already passed.
     *
     * A REDUCTION IS GIVEN NONE, and that is the function's own first branch rather than a
     * condition here: nothing is being collected, so there is no date to miss. `null` from a
     * configured-nothing tenant also stays null — exactly today's behaviour for every other
     * charge, because a collections consequence nobody configured is one nobody chose.
     */
    const due = await resolveCorrectionDueDate(supabase, {
        orgId: input.orgId,
        amountCents: input.amountCents,
        effectiveDate: input.effectiveDate,
        periodStartsOn: resolvedPeriod.startsOn,
        /* The account dimension, so an account-scoped rule resolves — see `resolveDueDate`. */
        customerId: resolvedPeriod.customerId,
    });

    try {
        const result = await applyReductionCore(supabase, {
            orgId: input.orgId,
            actorUserId: input.actorUserId,
            subject: {
                enrollmentAgreementId: input.enrollmentAgreementId,
                customerId: input.customerId ?? null,
                customerMemberId: input.customerMemberId ?? null,
                sourceChargeId: input.sourceChargeId ?? null,
                periodKey: resolvedPeriodKey,
            },
            charge: {
                chargeCategory: input.chargeCategory,
                description: input.chargeCategory,
                serviceDate: input.effectiveDate,
                dueDate: due.dueDate,
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
        /*
         * ── THE REVERSAL RESOLVES ITS OWN PERIOD. THIS USED TO BE `original.period_key`. ──────
         *
         * The reversal is correctly dated TODAY — it is prospective economics, which is what §17
         * requires — and then it was handed the original's period key, which is the one input that
         * puts it back into the period it is dated out of. A credit raised in a now-finalized
         * November and reversed in December was written as a December charge carrying a November
         * period key: the canonical `billing_period_id` was right, because the S2 binder resolves
         * that from the charge's own date, and the STATED period contradicted it. Every surface
         * that reads `period_key` therefore showed the reversal inside closed history, which is
         * precisely the appearance of rewriting the past that commercial finality exists to make
         * impossible.
         *
         * Omitting it lets `resolveManualReductionPeriod` answer from the reversal's own effective
         * date, through the account's own calendar — the same resolution any other prospective
         * correction gets. The original row is still untouched; that was never the problem.
         */
        /*
         * THE OBLIGATION THE ORIGINAL REDUCED — not the credit's own charge.
         *
         * `source_charge_id` is how a reduction attaches to the thing it reduces:
         * `resolveAllocatableNet` nets a charge as its amount plus the reductions naming it. Pointing
         * the reversal at the credit's own charge attached it to nothing anybody asks about, so the
         * obligation stayed reduced after the operator had undone the reduction — the money came
         * back on the ledger's signed total and never came back on what the family actually owed.
         *
         * Lineage is not what this field is for, and never was: `reverses_id` and `reversed_by_id`
         * already record which reversal undoes which reduction.
         */
        sourceChargeId: original.source_charge_id,
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

/**
 * The period key the account's own calendar gives this date.
 *
 * Falls back to the calendar month ONLY when the account has no usable calendar — which is the
 * legacy interpretation, and the honest answer for an account the canonical calendar does not yet
 * govern. It does not invent a cadence, and it never reads a location or a term anchor.
 */
async function resolveManualReductionPeriod(
    supabase: SupabaseClient,
    input: ManualReductionInput,
): Promise<{ key: string; startsOn: string | null; customerId: string | null }> {
    const legacyMonth = legacyMonthlyPeriodKey(input.effectiveDate);
    let resolvedCustomerId: string | null = null;
    try {
        const customerId =
            input.customerId
            ?? (await resolveChargeCustomerId(supabase, {
                orgId: input.orgId,
                billableSourceType: "enrollment_agreement",
                billableSourceId: input.enrollmentAgreementId,
            }));
        resolvedCustomerId = customerId ?? null;
        if (!customerId) return { key: legacyMonth, startsOn: null, customerId: null };
        const calendar = await resolveCustomerCalendar(supabase, {
            orgId: input.orgId,
            customerId,
            onDate: input.effectiveDate,
        });
        if (calendar.kind !== "resolved") return { key: legacyMonth, startsOn: null, customerId: resolvedCustomerId };
        const { current } = currentAndNextPeriods(calendar, input.effectiveDate);
        /*
         * THE PERIOD'S START IS RETURNED ALONGSIDE ITS KEY because the due-date policy's two
         * period-anchored strategies need it, and re-deriving it from the key would mean parsing a
         * label — the one shape a weekly account's `2026-11-09~2026-11-15` key makes look easy and
         * a monthly account's `2026-11` makes impossible.
         *
         * `null` where the calendar could not speak: the legacy month is a usable KEY but it is not
         * evidence of a commercial period, so it supplies no anchor. A period-anchored due-date
         * rule then resolves to no date rather than to a date cut off a fallback.
         */
        return { key: current.key, startsOn: current.start, customerId: resolvedCustomerId };
    } catch {
        /* A reduction must not fail because a calendar lookup did; history's reading still applies. */
        return { key: legacyMonth, startsOn: null, customerId: resolvedCustomerId };
    }
}
