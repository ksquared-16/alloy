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
import {
    computeCollectiblePosition,
    SUPPRESSING_CLAIM_STATES,
    type CollectiblePosition,
} from "@/lib/financials/subsidy/collectiblePosition";

/*
 * The arithmetic lives in `collectiblePosition.ts` and is shared with the cross-household
 * projection the Financials workspace reads. This function is now exactly the READING: it
 * fetches one charge's facts and hands them over. Re-exported here so every existing caller
 * keeps its import.
 */
export { SUPPRESSING_CLAIM_STATES };
export type { CollectiblePosition };

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

    // ── RESPONSIBILITY (Thread 6) ───────────────────────────────────────────────────────────
    const { data: allocationRows, error: allocationError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, assigned_amount_cents, is_unassigned, share_id")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId)
        .eq("state", "active");
    if (allocationError) throw new CollectibleError("db_error", allocationError.message);
    const allocations = (allocationRows ?? []) as Array<{ id: string; assigned_amount_cents: number; is_unassigned: boolean; share_id: string | null }>;

    // ── EXPECTED SUBSIDY (Thread 6's seam, with Thread 9's provenance) ──────────────────────
    /* The same two anchors a claim reads: this period's allocation, or the share behind it. */
    const allocationIds = allocations.map((a) => a.id);
    const shareIds = [...new Set(allocations.map((a) => a.share_id).filter((v): v is string => !!v))];
    const [{ data: fundingByAllocation }, { data: fundingByShare }] = await Promise.all([
        allocationIds.length
            ? supabase
                  .from("financial_expected_funding")
                  .select("id, expected_amount_cents, percent_basis_points, basis, state, allocation_id, share_id")
                  .eq("org_id", args.orgId).eq("state", "active").in("allocation_id", allocationIds)
            : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        shareIds.length
            ? supabase
                  .from("financial_expected_funding")
                  .select("id, expected_amount_cents, percent_basis_points, basis, state, allocation_id, share_id")
                  .eq("org_id", args.orgId).eq("state", "active").is("allocation_id", null).in("share_id", shareIds)
            : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    const fundingRows = ([...(fundingByAllocation ?? []), ...(fundingByShare ?? [])]) as Array<Record<string, unknown>>;

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

    const lineIds = claimLines.map((l) => l.id);
    const { data: varianceRows } = lineIds.length
        ? await supabase
              .from("financial_subsidy_variances")
              .select("variance_cents, state, resolution_kind")
              .eq("org_id", args.orgId)
              .in("claim_line_id", lineIds)
        : { data: [] };
    const variances = ((varianceRows ?? []) as Array<{ variance_cents: number; state: string; resolution_kind: string | null }>);

    // ── EVERY FACT IS NOW IN HAND. THE ARITHMETIC IS SOMEBODY ELSE'S ───────────────────────
    return computeCollectiblePosition({
        chargeId: args.chargeId,
        currencyCode: net.currencyCode,
        chargeStatus: net.status,
        grossCents: net.grossCents,
        reductionsCents: net.reductionsCents,
        netCents: net.netCents,
        applications: activeApplications.map((a) => {
            const payment = payments.get(a.payment_id);
            return {
                allocatedAmountCents: Number(a.allocated_amount_cents) || 0,
                status: a.status ?? "active",
                paymentStatus: payment?.status ?? null,
                payerEntityType: payment?.payer_entity_type ?? null,
            };
        }),
        allocations: allocations.map((a) => ({
            assignedAmountCents: Number(a.assigned_amount_cents),
            isUnassigned: a.is_unassigned,
        })),
        expectedFunding: fundingRows.map((f) => ({
            basis: (f.basis as string | null) ?? null,
            expectedAmountCents: f.expected_amount_cents == null ? null : Number(f.expected_amount_cents),
            percentBasisPoints: f.percent_basis_points == null ? null : Number(f.percent_basis_points),
        })),
        claimLines: claimLines.map((l) => ({
            claimId: l.claim_id,
            claimedAmountCents: Number(l.claimed_amount_cents),
            claimState: claimStateById.get(l.claim_id) ?? null,
        })),
        variances: variances.map((v) => ({
            varianceCents: Number(v.variance_cents),
            state: v.state,
            resolutionKind: v.resolution_kind,
        })),
    });
}
