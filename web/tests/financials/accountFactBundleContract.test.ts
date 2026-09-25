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

/**
 * ── THE CONTRACT LOCK ───────────────────────────────────────────────────────────────────────────
 *
 * The decision this slice encodes: the account fact bundle is the canonical acquisition boundary,
 * and a bundle that fails makes the whole account financial answer UNAVAILABLE.
 *
 * The dangerous case is not a bundle that comes back empty. It is a bundle that comes back FULL of
 * perfectly good ledger facts while the acquisition itself reports failure — because that is the
 * shape from which a coherent-looking answer can be assembled out of an incomplete read. A money
 * surface must refuse it, and refusing it must not depend on the payload happening to be empty.
 */
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const LEDGER_FACTS = {
    ...FULL,
    agreements: [{ id: "agr-1", customer_member_id: "mem-1", customer_id: "cust-1", status: "active" }],
    members: [{ id: "mem-1", first_name: "A", last_name: "B", display_name: "A B", person_id: "per-1" }],
    charges: [{
        id: "charge-0", billable_source_type: "enrollment_agreement", billable_source_id: "agr-1",
        source_charge_id: null, charge_category: "tuition", charge_type: "tuition", status: "posted",
        amount_cents: 10_000, currency_code: "USD", charge_template_id: null, service_date: "2026-09-01",
        occurs_on: "2026-09-01", billable_on: "2026-09-01", due_date: "2026-09-01",
        posted_at: "2026-09-01T00:00:00Z", voided_at: null, description: "tuition", metadata: {},
        created_at: "2026-09-01T00:00:00Z",
    }],
};

/** Table reads all answer; only the acquisition boundary is varied. */
const cardClient = (rpcAnswer: { data: unknown; error: unknown }) =>
    ({
        from: () => {
            const chain: Record<string, unknown> = {};
            for (const k of ["select", "eq", "in", "is", "not", "gte", "lte", "lt", "gt", "or", "order", "limit", "range", "neq"]) {
                chain[k] = () => chain;
            }
            chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
            chain.single = chain.maybeSingle;
            chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
            return chain;
        },
        rpc: () => ({ then: (resolve: (v: unknown) => unknown) => resolve(rpcAnswer) }),
    }) as never;

describe("a failed acquisition is UNAVAILABLE, even when the payload looks complete", () => {
    it("THE LOCK: valid ledger facts + a failed acquisition = no answer at all", async () => {
        const vm = await buildFinancialsCardVM(
            cardClient({ data: LEDGER_FACTS, error: { message: "connection reset" } }),
            { orgId: "org", customerId: "cust-1", customerMemberId: null, today: "2026-09-24" },
        );
        expect(vm.unavailableReason, "the card says it cannot answer").toMatch(/unavailable/i);
        expect(vm.rows, "no ledger is assembled from an acquisition that failed").toEqual([]);
        expect(vm.collectible?.currentlyCollectibleCents ?? 0, "and no balance is claimed").toBe(0);
    });

    it("KNOWN ZERO is not UNAVAILABLE: an account with genuinely no receipts still answers", async () => {
        const vm = await buildFinancialsCardVM(
            cardClient({ data: { ...LEDGER_FACTS, payments_by_source: [], payments_backing: [], payment_allocations: [] }, error: null }),
            { orgId: "org", customerId: "cust-1", customerMemberId: null, today: "2026-09-24" },
        );
        expect(vm.unavailableReason, "a family that has paid nothing is a known answer").toBeFalsy();
        expect(vm.rows.length, "and its ledger renders").toBeGreaterThan(0);
    });

    it("the two are distinguishable at the seam, not merely at the card", async () => {
        /* Same empty receipts, opposite acquisition outcomes — one answers, one refuses. */
        await expect(readAccountFactBundle(clientReturning(LEDGER_FACTS, { message: "down" }), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        })).rejects.toThrow(/unavailable/i);
        const ok = await readAccountFactBundle(clientReturning({ ...LEDGER_FACTS, payments_by_source: [] }), {
            orgId: "org", customerId: "cust-1", customerMemberId: null,
        });
        expect(ok.paymentsBySource, "asked, and there are none").toEqual([]);
        expect(ok.counts.charges, "which the counts confirm was a real answer").toBe(1);
    });
});
