/**
 * THE SEAM'S CONTRACT — what it maps, and what it refuses to turn into a zero.
 *
 * The depth gate can only prove the card asks ONCE. It cannot prove the answer is complete, and a
 * first cut of that coverage asserted the keys of a literal declared in its own test file — which
 * is self-referential: dropping a field from the real mapping left it green. This drives the real
 * `readAccountFactBundle` instead, so a set that stops being carried reddens here.
 *
 * §12's four states are distinct and must stay distinct: KNOWN ZERO is an empty array with counts
 * that say so; UNAVAILABLE throws. A read that could not answer must never arrive as an account
 * that owes nothing.
 */
import { describe, expect, it } from "vitest";

import {
    positionFactsFromBundle,
    readAccountFactBundle,
    type AccountFactBundle,
} from "@/lib/financials/workspace/readAccountFactBundle";

/** One row in every set, so a set that stops being mapped becomes visibly empty. */
const ONE = (extra: Record<string, unknown> = {}) => [{ id: "x", ...extra }];
const FULL = {
    resolved_customer_id: "cust-1",
    agreements: ONE(), members: ONE(), reductions_by_agreement: ONE(),
    commercial_policies: ONE(), charges: ONE(),
    reductions_by_charge: [{ source_charge_id: "charge-0", amount_cents: -4000 }],
    payment_allocations: [{ id: "pa-1", charge_id: "charge-0", payment_id: "pay-1", status: "active", allocated_amount_cents: 100 }],
    responsibility_allocations: [{ id: "alloc-1", charge_id: "charge-0", share_id: "share-1", assigned_amount_cents: 100, is_unassigned: false }],
    subsidy_claim_lines: [{ id: "line-1", charge_id: "charge-0", claim_id: "claim-1", claimed_amount_cents: 10 }],
    payments_backing: [{ id: "pay-1", status: "succeeded", payer_entity_type: "customer" }],
    responsibility_attributions: [{ responsibility_allocation_id: "alloc-1", amount_cents: 5 }],
    responsible_persons: ONE(), funding_by_allocation: [{ allocation_id: "alloc-1" }],
    funding_by_share: [{ share_id: "share-1" }], funding_for_responsibility: ONE(),
    subsidy_claims: [{ id: "claim-1", state: "submitted" }],
    subsidy_variances: [{ claim_line_id: "line-1", variance_cents: 1 }],
    collection_attempts: ONE({ charge_id: "charge-0" }), payments_by_source: ONE(),
    counts: { agreements: 1, charges: 1, allocations: 1, claim_lines: 1 },
};

const clientReturning = (data: unknown, error: unknown = null) =>
    ({ rpc: async () => ({ data, error }) }) as never;

const SETS: Array<keyof AccountFactBundle> = [
    "agreements", "members", "reductionsByAgreement", "commercialPolicies", "charges",
    "reductionsByCharge", "paymentAllocations", "responsibilityAllocations", "subsidyClaimLines",
    "paymentsBacking", "responsibilityAttributions", "responsiblePersons", "fundingByAllocation",
    "fundingByShare", "fundingForResponsibility", "subsidyClaims", "subsidyVariances",
    "collectionAttempts", "paymentsBySource",
];

describe("the account fact bundle carries every dependent set", () => {
    it("maps all nineteen fact sets out of the function's answer", async () => {
        const bundle = await readAccountFactBundle(clientReturning(FULL), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        });
        for (const set of SETS) {
            expect((bundle[set] as unknown[]).length, `${String(set)} was not carried through`).toBeGreaterThan(0);
        }
        expect(bundle.resolvedCustomerId).toBe("cust-1");
        expect(bundle.counts.charges).toBe(1);
    });
});

describe("a read that could not answer is not an account that owes nothing", () => {
    it("UNAVAILABLE: an rpc error throws rather than returning empty sets", async () => {
        await expect(readAccountFactBundle(clientReturning(null, { message: "connection reset" }), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        })).rejects.toThrow(/unavailable/i);
    });

    it("UNAVAILABLE: an answer that is not a bundle throws", async () => {
        await expect(readAccountFactBundle(clientReturning(null), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        })).rejects.toThrow(/unavailable/i);
    });

    it("KNOWN ZERO: an account with nothing returns empty sets and says so in the counts", async () => {
        const bundle = await readAccountFactBundle(clientReturning({
            resolved_customer_id: "cust-1",
            counts: { agreements: 0, charges: 0, allocations: 0, claim_lines: 0 },
        }), { orgId: "org", customerId: "cust-1", customerMemberId: null });
        expect(bundle.charges).toEqual([]);
        expect(bundle.counts.charges, "asked, and there are none — not 'never gathered'").toBe(0);
    });
});

describe("the position facts are narrowed to the charges being asked about", () => {
    it("keeps only the facts for those charges, through every anchor", async () => {
        const bundle = await readAccountFactBundle(clientReturning(FULL), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        });
        const facts = positionFactsFromBundle(bundle, new Set(["charge-0"]));
        expect(facts.applications.length).toBe(1);
        expect(facts.responsibilityAllocations.length).toBe(1);
        expect(facts.claimLines.length).toBe(1);
        expect(facts.paymentsBacking.length, "the payment its application names").toBe(1);
        expect(facts.fundingByAllocation.length, "funding anchored on that allocation").toBe(1);
        expect(facts.fundingByShare.length, "funding anchored on that allocation's share").toBe(1);
        expect(facts.claims.length, "the claim its line names").toBe(1);
        expect(facts.variances.length, "the variance on that line").toBe(1);
    });

    it("drops the facts for charges outside the question", async () => {
        const bundle = await readAccountFactBundle(clientReturning(FULL), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        });
        const facts = positionFactsFromBundle(bundle, new Set(["some-other-charge"]));
        expect(facts.applications).toEqual([]);
        expect(facts.responsibilityAllocations).toEqual([]);
        expect(facts.paymentsBacking, "a payment reached only through an excluded charge").toEqual([]);
        expect(facts.fundingByShare).toEqual([]);
        expect(facts.claims).toEqual([]);
    });
});
