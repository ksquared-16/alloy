/**
 * WHAT THERE IS TO ALLOCATE — one charge's net, derived once, server-side.
 *
 * Thread 10 established that a family's net is gross less separately-recorded reductions, and it
 * left the link that makes a PER-CHARGE net derivable: every reduction application names the gross
 * charge it reduced (`financial_reduction_applications.source_charge_id`). What did not exist was
 * anywhere to ask the question — the only net in the platform was an account-level figure computed
 * inside the Financials card's read model, per request.
 *
 * This is that question, and deliberately nothing more. It is NOT a balance: it says what a charge
 * is worth after its reductions, not what is still owed. `buildFinancialsCardVM` remains the single
 * balance authority and Thread 8 the only thing that reduces outstanding.
 *
 * ── WHY IT READS THE APPLICATIONS AND NOT THE REDUCTION CHARGES ──
 *
 * Both would give the same cents today. The applications are the DECISION — they name the charge
 * they reduced, carry the basis, and are the row Thread 10 certifies. A reduction charge only says
 * `metadata.reduces_charge_id`, which is a convenience, not a contract. Allocating money against
 * the decision keeps this reading the same source the reduction's own explanation reads.
 *
 * ── WHY A HOUSEHOLD CHARGE CARRIES RESPONSIBILITY TOO ──
 *
 * This refused anything that was not enrolment-backed — "Only an enrolment-backed charge carries
 * responsibility" — and that sentence was never a financial invariant. It was this resolver's
 * convenience: the only reason it wanted an agreement was to look up the household, and it had no
 * other way to find one.
 *
 * Meanwhile `writeTemplateDraftCharge` accepts a `customer` billable source deliberately, naming "a
 * waitlist fee, a registration fee, a deposit" — charges a family incurs before anyone is enrolled.
 * So Financials would create and post household money and then refuse to say who owed it. The
 * arrangement model never had that limit: `financial_responsibility_arrangements` is keyed on
 * `customer_id NOT NULL` with an OPTIONAL `customer_member_id`, and its own migration says so —
 * "Scope. The account always; ONE CHILD optionally".
 *
 * BILLABLE-SOURCE GRAIN DETERMINES ATTRIBUTION, NOT WHETHER RESPONSIBILITY EXISTS. An agreement
 * charge is child-attributed and an account-wide or child-narrowed arrangement may bear it; a
 * customer charge is household-attributed, names no child, and only an account-wide arrangement can
 * bear it — which `readArrangementInForce` already gets right, because a child-narrowed arrangement
 * cannot match a null child.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";

function isChildcareBillableSourceType(value: string | null): boolean {
    return (CHILDCARE_BILLABLE_SOURCE_TYPES as readonly string[]).includes((value ?? "").trim());
}

export type AllocatableNet = {
    chargeId: string;
    /** The posted/gross charge, exactly as it stands. Never modified by anything here. */
    grossCents: number;
    /** Signed, and negative when reductions exist — Thread 10 stores the direction. */
    reductionsCents: number;
    /** gross + reductions. Zero is a legitimate answer; negative is not. */
    netCents: number;
    currencyCode: string;
    customerId: string | null;
    /** The child, when the obligation is child-attributed. Null for a household obligation. */
    customerMemberId: string | null;
    /** Null when the obligation is household-sourced — there is no agreement, and none is invented. */
    enrollmentAgreementId: string | null;
    serviceDate: string | null;
    periodKey: string | null;
    status: string;
    /** Each reduction that made up the figure, so the number can be explained rather than trusted. */
    reductions: Array<{ applicationId: string; policyId: string | null; amountCents: number; explanation: string | null }>;
};

export class AllocatableNetError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export async function resolveAllocatableNet(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<AllocatableNet> {
    const { data: chargeRow, error: chargeError } = await supabase
        .from("charges")
        .select("id, org_id, charge_category, amount_cents, currency_code, status, service_date, billable_source_type, billable_source_id")
        .eq("org_id", args.orgId)
        .eq("id", args.chargeId)
        .maybeSingle();
    if (chargeError) throw new AllocatableNetError("db_error", chargeError.message);
    if (!chargeRow) throw new AllocatableNetError("not_found", "No such charge in this organisation.");
    const charge = chargeRow as {
        id: string;
        charge_category: string | null;
        amount_cents: number;
        currency_code: string;
        status: string;
        service_date: string | null;
        billable_source_type: string | null;
        billable_source_id: string | null;
    };

    /*
     * A REDUCTION IS NOT ALLOCATED; IT IS SUBTRACTED. Dividing a −$150.00 discount between two
     * parents is a different act from dividing the tuition it reduced, and doing both would take
     * the discount off the family twice.
     */
    if ((charge.charge_category ?? "") !== "tuition" && charge.amount_cents <= 0) {
        throw new AllocatableNetError(
            "not_allocatable",
            "Responsibility is allocated over an obligation, not over a reduction or a credit.",
        );
    }
    if (charge.status === "void") {
        throw new AllocatableNetError("not_allocatable", "A void charge has nothing to allocate.");
    }
    /*
     * A SOURCE IS REQUIRED; AN AGREEMENT IS NOT.
     *
     * The refusal that remains is the one that was always real: money whose owner cannot be named
     * must not be divided between people. Which of the two childcare sources it is decides the
     * ATTRIBUTION, and that is settled below.
     */
    if (!isChildcareBillableSourceType(charge.billable_source_type) || !charge.billable_source_id) {
        throw new AllocatableNetError(
            "not_allocatable",
            "Responsibility needs a childcare billable source — an enrolment agreement or a household.",
        );
    }

    const { data: reductionRows, error: reductionError } = await supabase
        .from("financial_reduction_applications")
        .select("id, commercial_policy_id, amount_cents, explanation, period_key, customer_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("source_charge_id", args.chargeId);
    if (reductionError) throw new AllocatableNetError("db_error", reductionError.message);
    const reductions = ((reductionRows ?? []) as Array<{
        id: string;
        commercial_policy_id: string | null;
        amount_cents: number;
        explanation: string | null;
        period_key: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
    }>);

    const reductionsCents = reductions.reduce((acc, r) => acc + Number(r.amount_cents), 0);
    const netCents = Number(charge.amount_cents) + reductionsCents;
    if (netCents < 0) {
        // Thread 10 clamps the aggregate at zero, so this is unreachable through its own path; if it
        // is ever reached, something else reduced the charge and the honest move is to refuse
        // rather than allocate a negative obligation between people.
        throw new AllocatableNetError("negative_net", `Charge ${args.chargeId} nets below zero.`);
    }

    /*
     * WHOSE ACCOUNT THIS IS — asked of the one owner that already answers it for both sources.
     *
     * `resolveBillableSourceHouseholdId` is the resolver the payment/charge gate uses to decide
     * whether two sources belong to the same household. It knows that a household source IS the
     * household, and it recovers the household from the CHILD when an agreement's denormalised
     * `customer_id` is null — a fallback the inline lookup here never had. Quoting it means a charge
     * and a payment cannot disagree about whose money they are.
     */
    const isAgreement = charge.billable_source_type === "enrollment_agreement";
    const customerId = await resolveBillableSourceHouseholdId(
        supabase,
        args.orgId,
        charge.billable_source_type,
        charge.billable_source_id,
    );

    /*
     * The CHILD comes only from an agreement. A household obligation names no child, and inventing
     * one — the household's only child, say — would attach account money to a person who never
     * incurred it and would let a child-narrowed arrangement bear a charge it was never written for.
     */
    let customerMemberId: string | null = null;
    if (isAgreement) {
        const { data: agreementRow, error: agreementError } = await supabase
            .from("child_enrollment_agreements")
            .select("customer_member_id")
            .eq("org_id", args.orgId)
            .eq("id", charge.billable_source_id)
            .maybeSingle();
        if (agreementError) throw new AllocatableNetError("db_error", agreementError.message);
        customerMemberId = (agreementRow as { customer_member_id: string | null } | null)?.customer_member_id ?? null;
    }

    return {
        chargeId: charge.id,
        grossCents: Number(charge.amount_cents),
        reductionsCents,
        netCents,
        currencyCode: charge.currency_code,
        customerId,
        customerMemberId,
        enrollmentAgreementId: isAgreement ? charge.billable_source_id : null,
        serviceDate: charge.service_date,
        periodKey: charge.service_date ? charge.service_date.slice(0, 7) : null,
        status: charge.status,
        reductions: reductions.map((r) => ({
            applicationId: r.id,
            policyId: r.commercial_policy_id,
            amountCents: Number(r.amount_cents),
            explanation: r.explanation,
        })),
    };
}
