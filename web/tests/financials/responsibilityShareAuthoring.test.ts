/**
 * PERCENTAGE / FIXED / REMAINDER AUTHORING — proven through the canonical service.
 *
 * `SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` said fixed shares were operator-authorable while
 * percentage and remainder existed in the authority with no authoring surface. The authority was
 * never the gap, and these drive it directly: every refusal below is the service's own, not a
 * rule re-implemented in a form.
 */
import { describe, expect, it } from "vitest";

import { configureResponsibilityArrangement } from "@/lib/financials/responsibility/arrangementService";

const ORG = "org-1";
const CUSTOMER = "cust-1";
const A = "person-a";
const B = "person-b";

/** Serves the customer check and the party-membership check; refuses to reach the write. */
function client(opts: { persons?: string[] } = {}) {
    const persons = (opts.persons ?? [A, B]).map((id) => ({ id }));
    return {
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self; chain.eq = self; chain.in = self; chain.is = self; chain.order = self;
            chain.maybeSingle = async () => ({
                data: table === "customers" ? { id: CUSTOMER } : null, error: null,
            });
            chain.insert = () => ({
                select: () => ({
                    single: async () => ({ data: { id: "arr-new" }, error: null }),
                    maybeSingle: async () => ({ data: { id: "arr-new" }, error: null }),
                }),
                then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
            });
            chain.update = self;
            chain.then = (r: (v: unknown) => unknown) =>
                r({ data: table === "persons" ? persons : [], error: null });
            return chain;
        },
    } as never;
}

const configure = (shares: unknown[], opts: { persons?: string[] } = {}) =>
    configureResponsibilityArrangement(client(opts), {
        orgId: ORG, customerId: CUSTOMER, effectiveStart: "2026-09-01",
        shares: shares as never, actorUserId: "user-1",
    });

const refusalOf = async (shares: unknown[], opts: { persons?: string[] } = {}) => {
    try { await configure(shares, opts); return null; }
    catch (e) { return (e as { code?: string }).code ?? (e as Error).message; }
};

describe("share authoring the canonical authority already supported", () => {
    it("one party at 100%", async () => {
        expect(await refusalOf([{ responsiblePartyId: A, method: "percentage", percentBasisPoints: 10_000 }])).toBeNull();
    });

    it("60 / 40 between two parties", async () => {
        expect(await refusalOf([
            { responsiblePartyId: A, method: "percentage", percentBasisPoints: 6_000 },
            { responsiblePartyId: B, method: "percentage", percentBasisPoints: 4_000 },
        ])).toBeNull();
    });

    it("a fixed amount plus a remainder", async () => {
        expect(await refusalOf([
            { responsiblePartyId: A, method: "fixed", amountCents: 2_500 },
            { responsiblePartyId: B, method: "remainder" },
        ])).toBeNull();
    });
});

describe("what the authority refuses, and why the UI need not re-check it", () => {
    it("a total over 100%", async () => {
        expect(await refusalOf([
            { responsiblePartyId: A, method: "percentage", percentBasisPoints: 7_000 },
            { responsiblePartyId: B, method: "percentage", percentBasisPoints: 4_000 },
        ])).toBe("percentage_over_100");
    });

    it("a second remainder", async () => {
        expect(await refusalOf([
            { responsiblePartyId: A, method: "remainder" },
            { responsiblePartyId: B, method: "remainder" },
        ])).toBe("multiple_remainders");
    });

    it("the same party twice", async () => {
        expect(await refusalOf([
            { responsiblePartyId: A, method: "percentage", percentBasisPoints: 5_000 },
            { responsiblePartyId: A, method: "percentage", percentBasisPoints: 5_000 },
        ])).toBe("duplicate_party");
    });

    it("a party outside the organization", async () => {
        expect(await refusalOf(
            [{ responsiblePartyId: B, method: "percentage", percentBasisPoints: 10_000 }],
            { persons: [A] },
        )).toBeTruthy();
    });

    it("basis points outside 0-10000", async () => {
        expect(await refusalOf([{ responsiblePartyId: A, method: "percentage", percentBasisPoints: 10_001 }]))
            .toBe("invalid_percentage");
    });

    it("no shares at all", async () => {
        expect(await refusalOf([])).toBe("no_shares");
    });
});
