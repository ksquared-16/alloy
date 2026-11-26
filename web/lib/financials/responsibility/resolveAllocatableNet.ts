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
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
    customerMemberId: string | null;
    /** The enrolment this obligation hangs off, or null when it was billed to the household. */
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
     * ── AN OBLIGATION IS AN OBLIGATION, WHOEVER IT WAS BILLED TO ─────────────────────────────
     *
     * This refused anything not backed by an enrolment agreement, which meant a HOUSEHOLD-grain
     * charge — a registration fee, a waitlist fee, an account-wide charge the operator deliberately
     * attributed to the household — could exist and could never be owed by anybody. Core can author
     * that obligation, so Core must be able to say who is responsible for it.
     *
     * The two source types are the two the charge writer already uses, and each carries the
     * household directly: an agreement names its customer and its child, a customer source IS the
     * customer. Nothing new is derived here.
     *
     * SUBJECT GRAIN IS NOT ALLOCATION. A household charge keeps `customerMemberId: null` — that is
     * intentional household grain, not missing data — and the arrangement that governs it is
     * matched on exactly that, so an account-wide arrangement applies and a child-scoped one does
     * not. Responsibility remains a separate question from whose obligation it is.
     */
    if (!charge.billable_source_id
        || (charge.billable_source_type !== "enrollment_agreement" && charge.billable_source_type !== "customer")) {
        throw new AllocatableNetError(
            "not_allocatable",
            "Only a charge billed to an enrolment or a household carries responsibility.",
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
     * The household and child come from the SOURCE the charge was written against, which is where
     * every other childcare financial read resolves them — never re-derived from the reduction rows.
     * A household-grain charge is its own answer: the customer source IS the household, and there
     * is no child, which is the whole point of that grain.
     */
    const enrolmentBacked = charge.billable_source_type === "enrollment_agreement";
    let agreement: { customer_id: string | null; customer_member_id: string | null } | null = null;
    if (enrolmentBacked) {
        const { data: agreementRow, error: agreementError } = await supabase
            .from("child_enrollment_agreements")
            .select("customer_id, customer_member_id")
            .eq("org_id", args.orgId)
            .eq("id", charge.billable_source_id)
            .maybeSingle();
        if (agreementError) throw new AllocatableNetError("db_error", agreementError.message);
        agreement = agreementRow as { customer_id: string | null; customer_member_id: string | null } | null;
    } else {
        agreement = { customer_id: charge.billable_source_id, customer_member_id: null };
    }

    return {
        chargeId: charge.id,
        grossCents: Number(charge.amount_cents),
        reductionsCents,
        netCents,
        currencyCode: charge.currency_code,
        customerId: agreement?.customer_id ?? null,
        customerMemberId: agreement?.customer_member_id ?? null,
        /* Null on a household charge: there is no enrolment behind it, and that is not a defect. */
        enrollmentAgreementId: enrolmentBacked ? charge.billable_source_id : null,
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
