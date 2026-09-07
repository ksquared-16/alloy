/**
 * WHAT SHOULD ACTUALLY BE COLLECTED FROM THIS FAMILY RIGHT NOW — derived, in one place.
 *
 * The approved policy (Director decision B) is narrow and deliberate: an authorization does not
 * suppress family collection, and neither does a draft claim. A SUBMITTED claim may suppress
 * collection for the amount it explicitly attributed — because submitting is the point at which the
 * provider has done the thing that makes the money genuinely receivable from the agency.
 *
 *     authoritative outstanding − governed submitted-claim suppression = currently collectible
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not a balance, and not stored. Thread 8 remains the sole authority for what a charge still owes,
 * and nothing here writes anything. The suppression is recomputed from claim state, claim-line
 * amounts and that outstanding every time it is asked for, so it cannot drift, cannot be edited into
 * something else, and disappears by itself the moment a claim is voided or denied. A materialised
 * copy would be a second balance wearing a different hat.
 *
 * ── THE THREE BOUNDS ──
 *
 * Suppression is the smallest of: what was actually claimed on submitted lines, the expected subsidy
 * attributable to the obligation, and what is still outstanding. Each bound exists because dropping
 * it produces a specific lie — claiming more than was expected, expecting more than was claimed, or
 * suppressing money the family no longer owes because somebody already paid it.
 *
 * ── AND WHAT A SHORTFALL DOES ──
 *
 * Nothing, on its own. When $900 was claimed and $825 arrived, the $75 becomes an unresolved
 * variance and the family's collectible amount does NOT quietly rise to cover it. That is the whole
 * of decision B point 8, and it is why `unresolvedVarianceCents` is reported beside the figure
 * rather than folded into it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAllocatableNet, AllocatableNetError } from "@/lib/financials/responsibility/resolveAllocatableNet";

/** Claim states in which a claim has been sent and may therefore suppress collection. */
export const SUPPRESSING_CLAIM_STATES = ["submitted", "accepted"] as const;

export type CollectiblePosition = {
    chargeId: string;
    currencyCode: string;
    /** Thread 8's answer: the posted charge less active applications of posted payments. */
    outstandingCents: number;
    /** Thread 6: what named parties were made responsible for, plus anything still unassigned. */
    assignedResponsibilityCents: number;
    unassignedResponsibilityCents: number;
    /** Thread 6 expected funding attributable to this obligation. Never money. */
    expectedSubsidyCents: number;
    /** The bounded, governed suppression — submitted claims only. */
    submittedClaimSuppressionCents: number;
    /** Agency money that actually arrived and was applied to this charge. */
    actualSubsidyReceivedCents: number;
    /** Signed. Negative is short-paid or denied; positive is an overpayment. */
    unresolvedVarianceCents: number;
    /** outstanding − suppression, never below zero. */
    currentlyCollectibleCents: number;
    /** Every figure above, with the row that produced it, so an operator can be told why. */
    explanation: {
        grossCents: number;
        reductionsCents: number;
        netCents: number;
        suppressionBoundBy: "claimed" | "expected" | "outstanding" | "none";
        submittedClaimIds: string[];
        openVarianceStates: string[];
    };
};

export class CollectibleError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export async function resolveFamilyCollectible(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<CollectiblePosition> {
    let net;
    try {
        net = await resolveAllocatableNet(supabase, { orgId: args.orgId, chargeId: args.chargeId });
    } catch (err) {
        if (err instanceof AllocatableNetError) throw new CollectibleError(err.code, err.message);
        throw err;
    }

    // ── OUTSTANDING IS THREAD 8'S, QUOTED ───────────────────────────────────────────────────
    /*
     * A charge owes its own amount less every ACTIVE application of a POSTED payment. That predicate
     * is `buildFinancialsCardVM`'s and `jobPaymentBalances`'s, quoted rather than re-derived, so the
     * card and this resolver cannot answer the same question differently. A draft charge owes
     * nothing yet; a pending payment has not arrived.
     */
    const { data: applicationRows, error: applicationError } = await supabase
        .from("payment_allocations")
        .select("allocated_amount_cents, status, payment_id, charge_id")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId);
    if (applicationError) throw new CollectibleError("db_error", applicationError.message);
    const applications = (applicationRows ?? []) as Array<{
        allocated_amount_cents: number;
        status: string;
        payment_id: string;
    }>;
    const activeApplications = applications.filter((a) => (a.status ?? "active") === "active");

    const paymentIds = [...new Set(activeApplications.map((a) => a.payment_id).filter(Boolean))];
    const { data: paymentRows } = paymentIds.length
        ? await supabase
              .from("payments")
              .select("id, status, direction, payer_entity_type, payer_entity_id")
              .eq("org_id", args.orgId)
              .in("id", paymentIds)
        : { data: [] };
    const payments = new Map(
        ((paymentRows ?? []) as Array<{ id: string; status: string; direction: string; payer_entity_type: string | null; payer_entity_id: string | null }>)
            .map((p) => [p.id, p]),
    );

    let appliedCents = 0;
    let actualSubsidyReceivedCents = 0;
    for (const application of activeApplications) {
        const payment = payments.get(application.payment_id);
        if (!payment || payment.status !== "posted") continue;
        const amount = Number(application.allocated_amount_cents) || 0;
        appliedCents += amount;
        // AGENCY MONEY IS TOLD APART BY WHO PAID IT — the payer identity Thread 6 taught the payment
        // path to record. Never by guessing from the amount.
        if ((payment.payer_entity_type ?? "") === "agency") actualSubsidyReceivedCents += amount;
    }

    const postedGross = net.status === "posted" ? net.grossCents + net.reductionsCents : 0;
    const outstandingCents = Math.max(0, postedGross - appliedCents);

    // ── RESPONSIBILITY (Thread 6) ───────────────────────────────────────────────────────────
    const { data: allocationRows, error: allocationError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, assigned_amount_cents, is_unassigned")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId)
        .eq("state", "active");
    if (allocationError) throw new CollectibleError("db_error", allocationError.message);
    const allocations = (allocationRows ?? []) as Array<{ id: string; assigned_amount_cents: number; is_unassigned: boolean }>;
    const assignedResponsibilityCents = allocations
        .filter((a) => !a.is_unassigned)
        .reduce((acc, a) => acc + Number(a.assigned_amount_cents), 0);
    const unassignedResponsibilityCents = allocations
        .filter((a) => a.is_unassigned)
        .reduce((acc, a) => acc + Number(a.assigned_amount_cents), 0);

    // ── EXPECTED SUBSIDY (Thread 6's seam, with Thread 9's provenance) ──────────────────────
    const allocationIds = allocations.map((a) => a.id);
    const { data: fundingRows } = allocationIds.length
        ? await supabase
              .from("financial_expected_funding")
              .select("id, expected_amount_cents, percent_basis_points, basis, state, allocation_id, share_id")
              .eq("org_id", args.orgId)
              .eq("state", "active")
              .in("allocation_id", allocationIds)
        : { data: [] };
    const expectedSubsidyCents = ((fundingRows ?? []) as Array<Record<string, unknown>>).reduce((acc, f) => {
        if (f.basis === "fixed_amount") return acc + Number(f.expected_amount_cents ?? 0);
        // A percentage of the NET, the same convention every other percentage in Financials uses.
        return acc + Math.floor((net.netCents * Number(f.percent_basis_points ?? 0)) / 10_000);
    }, 0);

    // ── WHAT WAS ACTUALLY CLAIMED, ON CLAIMS THAT WERE ACTUALLY SENT ────────────────────────
    const { data: claimLineRows, error: claimLineError } = await supabase
        .from("financial_subsidy_claim_lines")
        .select("id, claim_id, claimed_amount_cents")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId);
    if (claimLineError) throw new CollectibleError("db_error", claimLineError.message);
    const claimLines = (claimLineRows ?? []) as Array<{ id: string; claim_id: string; claimed_amount_cents: number }>;

    const claimIds = [...new Set(claimLines.map((l) => l.claim_id))];
    const { data: claimRows } = claimIds.length
        ? await supabase
              .from("financial_subsidy_claims")
              .select("id, state")
              .eq("org_id", args.orgId)
              .in("id", claimIds)
        : { data: [] };
    const claimStateById = new Map(((claimRows ?? []) as Array<{ id: string; state: string }>).map((c) => [c.id, c.state]));

    const submittedLines = claimLines.filter((l) =>
        (SUPPRESSING_CLAIM_STATES as readonly string[]).includes(claimStateById.get(l.claim_id) ?? ""),
    );
    const claimedCents = submittedLines.reduce((acc, l) => acc + Number(l.claimed_amount_cents), 0);
    const submittedClaimIds = [...new Set(submittedLines.map((l) => l.claim_id))];

    /*
     * THE SMALLEST OF THE THREE. Each bound removes a specific lie, and the one that bound the
     * answer is reported so an operator can be told which.
     */
    const bounds: Array<{ kind: CollectiblePosition["explanation"]["suppressionBoundBy"]; value: number }> = [
        { kind: "claimed", value: claimedCents },
        { kind: "expected", value: expectedSubsidyCents },
        { kind: "outstanding", value: outstandingCents },
    ];
    const winner = bounds.reduce((lowest, candidate) => (candidate.value < lowest.value ? candidate : lowest));
    const submittedClaimSuppressionCents = submittedLines.length === 0 ? 0 : Math.max(0, winner.value);

    // ── UNRESOLVED VARIANCE — reported beside the figure, never folded into it ──────────────
    const lineIds = claimLines.map((l) => l.id);
    const { data: varianceRows } = lineIds.length
        ? await supabase
              .from("financial_subsidy_variances")
              .select("variance_cents, state, resolution_kind")
              .eq("org_id", args.orgId)
              .in("claim_line_id", lineIds)
        : { data: [] };
    const openVariances = ((varianceRows ?? []) as Array<{ variance_cents: number; state: string; resolution_kind: string | null }>)
        .filter((v) => v.resolution_kind == null);
    const unresolvedVarianceCents = openVariances.reduce((acc, v) => acc + Number(v.variance_cents), 0);

    return {
        chargeId: args.chargeId,
        currencyCode: net.currencyCode,
        outstandingCents,
        assignedResponsibilityCents,
        unassignedResponsibilityCents,
        expectedSubsidyCents,
        submittedClaimSuppressionCents,
        actualSubsidyReceivedCents,
        unresolvedVarianceCents,
        currentlyCollectibleCents: Math.max(0, outstandingCents - submittedClaimSuppressionCents),
        explanation: {
            grossCents: net.grossCents,
            reductionsCents: net.reductionsCents,
            netCents: net.netCents,
            suppressionBoundBy: submittedLines.length === 0 ? "none" : winner.kind,
            submittedClaimIds,
            openVarianceStates: [...new Set(openVariances.map((v) => v.state))],
        },
    };
}
