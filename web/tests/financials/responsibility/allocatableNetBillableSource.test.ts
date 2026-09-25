/**
 * BILLABLE-SOURCE GRAIN DECIDES ATTRIBUTION, NOT WHETHER RESPONSIBILITY EXISTS.
 *
 * `resolveAllocatableNet` refused everything that was not enrolment-backed — "Only an enrolment-backed
 * charge carries responsibility" — while `writeTemplateDraftCharge` deliberately accepted a `customer`
 * billable source, naming "a waitlist fee, a registration fee, a deposit". Financials would therefore
 * create and post household money and then refuse to say who owed it.
 *
 * The sentence was never a financial invariant. It was this resolver's convenience: the only reason it
 * wanted an agreement was to find the household. The arrangement model never had the limit — its own
 * migration says "Scope. The account always; ONE CHILD optionally".
 */
import { describe, expect, it } from "vitest";

import { AllocatableNetError, resolveAllocatableNet } from "@/lib/financials/responsibility/resolveAllocatableNet";

const ORG = "org-1";

type Row = Record<string, unknown>;

/** A fake narrow enough that what each table returns is visible in the test that uses it. */
function fakeSupabase(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (col: string, val: unknown) => {
                    rows = rows.filter((r) => r[col] === val);
                    return api;
                },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                then: undefined,
            };
            // Terminal await on the builder itself (the reductions read does this).
            (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
                resolve({ data: rows, error: null });
            return api;
        },
    } as never;
}

const charge = (over: Row = {}): Row => ({
    id: "chg-1",
    org_id: ORG,
    charge_category: "fee",
    amount_cents: 20000,
    currency_code: "USD",
    status: "posted",
    service_date: "2026-09-25",
    billable_source_type: "enrollment_agreement",
    billable_source_id: "agr-1",
    ...over,
});

describe("an enrolment-backed charge is unchanged", () => {
    it("resolves its household and its child from the agreement", async () => {
        const net = await resolveAllocatableNet(
            fakeSupabase({
                charges: [charge()],
                child_enrollment_agreements: [{ id: "agr-1", org_id: ORG, customer_id: "cust-1", customer_member_id: "kid-1" }],
            }),
            { orgId: ORG, chargeId: "chg-1" },
        );
        expect(net.customerId).toBe("cust-1");
        expect(net.customerMemberId).toBe("kid-1");
        expect(net.enrollmentAgreementId).toBe("agr-1");
        expect(net.netCents).toBe(20000);
    });
});

describe("a household-sourced charge now carries responsibility", () => {
    it("is the household, with nothing to traverse", async () => {
        const net = await resolveAllocatableNet(
            fakeSupabase({ charges: [charge({ billable_source_type: "customer", billable_source_id: "cust-1" })] }),
            { orgId: ORG, chargeId: "chg-1" },
        );
        expect(net.customerId).toBe("cust-1");
        expect(net.netCents).toBe(20000);
    });

    /*
     * A household obligation names NO child. Inventing one — the household's only child, say — would
     * attach account money to a person who never incurred it, and would let a child-narrowed
     * arrangement bear a charge it was never written for.
     */
    it("names no child, and no agreement is invented for it", async () => {
        const net = await resolveAllocatableNet(
            fakeSupabase({
                charges: [charge({ billable_source_type: "customer", billable_source_id: "cust-1" })],
                child_enrollment_agreements: [{ id: "agr-1", org_id: ORG, customer_id: "cust-1", customer_member_id: "kid-1" }],
            }),
            { orgId: ORG, chargeId: "chg-1" },
        );
        expect(net.customerMemberId).toBeNull();
        expect(net.enrollmentAgreementId).toBeNull();
    });
});

describe("what is still refused", () => {
    it("refuses a source type that is not childcare money", async () => {
        await expect(
            resolveAllocatableNet(
                fakeSupabase({ charges: [charge({ billable_source_type: "job", billable_source_id: "job-1" })] }),
                { orgId: ORG, chargeId: "chg-1" },
            ),
        ).rejects.toBeInstanceOf(AllocatableNetError);
    });

    it("refuses a charge with no source at all — money whose owner cannot be named", async () => {
        await expect(
            resolveAllocatableNet(
                fakeSupabase({ charges: [charge({ billable_source_type: "customer", billable_source_id: null })] }),
                { orgId: ORG, chargeId: "chg-1" },
            ),
        ).rejects.toThrow(/billable source/i);
    });

    it("still refuses a reduction, whichever source it hangs off", async () => {
        // Dividing a −$150 discount between two parents would take it off the family twice.
        await expect(
            resolveAllocatableNet(
                fakeSupabase({
                    charges: [charge({ billable_source_type: "customer", billable_source_id: "cust-1", amount_cents: -15000 })],
                }),
                { orgId: ORG, chargeId: "chg-1" },
            ),
        ).rejects.toThrow(/not allocated|obligation, not over a reduction/i);
    });

    it("still refuses a void charge", async () => {
        await expect(
            resolveAllocatableNet(
                fakeSupabase({
                    charges: [charge({ billable_source_type: "customer", billable_source_id: "cust-1", status: "void" })],
                }),
                { orgId: ORG, chargeId: "chg-1" },
            ),
        ).rejects.toThrow(/void/i);
    });
});
