/**
 * ONE ROUND TRIP FOR THE FACTS THE CARD'S CHAIN USED TO WALK.
 *
 * The Financials card's reads happen in five DEPENDENT network waves: agreements name the
 * billable sources, those name the charges, the charges name their allocations and claim lines,
 * and those name the payments, people, funding, claims and variances behind them. Every wave
 * genuinely needs the previous wave's ids, so no amount of client concurrency removes them —
 * measured on deployed staging, five waves at roughly 300 ms of round trip each were most of a
 * 2.0-2.4 s response.
 *
 * `financials_account_fact_bundle` walks that chain inside the database, where the hops cost
 * microseconds. Measured on the certification tenant's largest account — 5,180 charges, 3,539
 * allocations, 3,125 payments — the whole bundle returns in 142-162 ms over PostgREST.
 *
 * ── THIS MOVES ACQUISITION, NOT MEANING ──
 *
 * Every set below is the same rows, the same columns and the same predicates the readers it
 * replaces already used. No balance, collectible position, responsibility split, reduction
 * eligibility or prepaid figure is computed here or in SQL: those stay with the canonical
 * authorities that own them. Where two readers ask one table differently, the function returns
 * the SUPERSET with the discriminating column, and each consumer applies its own rule unchanged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FactRow = Record<string, unknown>;

export type AccountFactBundle = {
    resolvedCustomerId: string | null;
    agreements: FactRow[];
    members: FactRow[];
    reductionsByAgreement: FactRow[];
    commercialPolicies: FactRow[];
    charges: FactRow[];
    reductionsByCharge: FactRow[];
    paymentAllocations: FactRow[];
    responsibilityAllocations: FactRow[];
    subsidyClaimLines: FactRow[];
    paymentsBacking: FactRow[];
    responsibilityAttributions: FactRow[];
    responsiblePersons: FactRow[];
    fundingByAllocation: FactRow[];
    fundingByShare: FactRow[];
    fundingForResponsibility: FactRow[];
    subsidyClaims: FactRow[];
    subsidyVariances: FactRow[];
    collectionAttempts: FactRow[];
    /** Asked-and-none, distinguishable from never-gathered. */
    counts: { agreements: number; charges: number; allocations: number; claimLines: number };
};

const list = (v: unknown): FactRow[] => (Array.isArray(v) ? (v as FactRow[]) : []);

/**
 * Fails CLOSED. A bundle that cannot be read is an absence of facts, never an empty account:
 * the callers' existing contract is that a charges failure makes the card unavailable, and this
 * throws so that contract still fires. It must never resolve to empty sets on error — that is
 * precisely how a read failure becomes a financial zero.
 */
export async function readAccountFactBundle(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string | null; customerMemberId: string | null },
): Promise<AccountFactBundle> {
    const { data, error } = await supabase.rpc("financials_account_fact_bundle", {
        p_org_id: args.orgId,
        p_customer_id: args.customerId,
        p_customer_member_id: args.customerMemberId,
    });
    if (error) throw new Error(`Financial records unavailable: ${error.message}`);
    if (!data || typeof data !== "object") {
        throw new Error("Financial records unavailable: the account fact bundle returned nothing.");
    }
    const b = data as Record<string, unknown>;
    const counts = (b.counts ?? {}) as Record<string, unknown>;
    return {
        resolvedCustomerId: (b.resolved_customer_id as string | null) ?? null,
        agreements: list(b.agreements),
        members: list(b.members),
        reductionsByAgreement: list(b.reductions_by_agreement),
        commercialPolicies: list(b.commercial_policies),
        charges: list(b.charges),
        reductionsByCharge: list(b.reductions_by_charge),
        paymentAllocations: list(b.payment_allocations),
        responsibilityAllocations: list(b.responsibility_allocations),
        subsidyClaimLines: list(b.subsidy_claim_lines),
        paymentsBacking: list(b.payments_backing),
        responsibilityAttributions: list(b.responsibility_attributions),
        responsiblePersons: list(b.responsible_persons),
        fundingByAllocation: list(b.funding_by_allocation),
        fundingByShare: list(b.funding_by_share),
        fundingForResponsibility: list(b.funding_for_responsibility),
        subsidyClaims: list(b.subsidy_claims),
        subsidyVariances: list(b.subsidy_variances),
        collectionAttempts: list(b.collection_attempts),
        counts: {
            agreements: Number(counts.agreements ?? 0),
            charges: Number(counts.charges ?? 0),
            allocations: Number(counts.allocations ?? 0),
            claimLines: Number(counts.claim_lines ?? 0),
        },
    };
}
