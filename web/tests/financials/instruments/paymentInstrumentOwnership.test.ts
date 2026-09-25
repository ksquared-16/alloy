/**
 * WHOSE CARD IS OFFERED, AND WHOSE IS NOT.
 *
 * The defect these guard against is one query away at all times: a read that fetches the household's
 * instruments and filters by owner afterwards works, passes a naive test, and leaks Dad's card to
 * Mom the first time someone refactors the filter out. So these assert the QUERY — which columns the
 * database was asked to constrain — as well as the result.
 */
import { describe, expect, it } from "vitest";

import {
    claimLegacyInstrument,
    listAccountInstrumentsForOperator,
    listReusableInstrumentsForPayer,
    resolvePayerCandidates,
} from "@/lib/financials/payments/instruments/paymentInstrumentOwnership";

const ORG = "org-1";
const ACCOUNT = "cust-1";
const MOM = "person-mom";
const DAD = "person-dad";

type Row = Record<string, unknown>;

/** Records every `.eq()` applied, so a test can assert what the DATABASE was asked to filter. */
function fakeSupabase(tables: Record<string, Row[]>, spy?: { filters: Record<string, unknown>[] }) {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const applied: Record<string, unknown> = { __table: table };
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (col: string, val: unknown) => {
                    applied[col] = val;
                    rows = rows.filter((r) => r[col] === val);
                    return api;
                },
                in: (col: string, vals: unknown[]) => {
                    rows = rows.filter((r) => vals.includes(r[col]));
                    return api;
                },
                update: (patch: Row) => {
                    const upd: Record<string, unknown> = {
                        eq: (col: string, val: unknown) => {
                            rows = rows.filter((r) => r[col] === val);
                            return upd;
                        },
                        then: (resolve: (v: unknown) => unknown) => {
                            for (const r of rows) Object.assign(r, patch);
                            return resolve({ error: null });
                        },
                    };
                    return upd;
                },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) => {
                    spy?.filters.push(applied);
                    return resolve({ data: rows, error: null });
                },
            };
            return api;
        },
    } as never;
}

const instrument = (over: Row = {}): Row => ({
    id: "pi-mom",
    org_id: ORG,
    customer_id: ACCOUNT,
    owner_entity_type: "person",
    owner_entity_id: MOM,
    rail: "card",
    reusable: true,
    status: "active",
    verification_state: null,
    brand: "visa",
    last4: "1111",
    legacy_customer_payment_method_id: null,
    ...over,
});

const HOUSEHOLD = [
    instrument(),
    instrument({ id: "pi-dad", owner_entity_id: DAD, brand: "mastercard", last4: "2222" }),
    // A legacy household row nobody has claimed.
    instrument({
        id: "pi-legacy",
        owner_entity_type: null,
        owner_entity_id: null,
        reusable: false,
        brand: "amex",
        last4: "9999",
        legacy_customer_payment_method_id: "cpm-old",
    }),
];

describe("a payer sees only their own instruments", () => {
    it("offers Mom her Visa and not Dad's Mastercard", async () => {
        const got = await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: HOUSEHOLD }), {
            orgId: ORG,
            customerId: ACCOUNT,
            payerPersonId: MOM,
        });
        expect(got.map((i) => i.last4)).toEqual(["1111"]);
    });

    it("offers Dad his Mastercard and not Mom's Visa", async () => {
        const got = await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: HOUSEHOLD }), {
            orgId: ORG,
            customerId: ACCOUNT,
            payerPersonId: DAD,
        });
        expect(got.map((i) => i.last4)).toEqual(["2222"]);
    });

    /*
     * The real guard. If the owner filter ever moves out of the query into post-processing, this
     * fails even though the returned list might still look right in a narrow fixture.
     */
    it("asks the DATABASE to constrain org, account, owner, reusable and status", async () => {
        const spy = { filters: [] as Record<string, unknown>[] };
        await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: HOUSEHOLD }, spy), {
            orgId: ORG,
            customerId: ACCOUNT,
            payerPersonId: MOM,
        });
        expect(spy.filters[0]).toEqual({
            __table: "payment_instruments",
            org_id: ORG,
            customer_id: ACCOUNT,
            owner_entity_type: "person",
            owner_entity_id: MOM,
            reusable: true,
            status: "active",
        });
    });

    it("never offers an unowned legacy instrument to anyone", async () => {
        for (const payer of [MOM, DAD, "person-grandma"]) {
            const got = await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: HOUSEHOLD }), {
                orgId: ORG,
                customerId: ACCOUNT,
                payerPersonId: payer,
            });
            expect(got.some((i) => i.id === "pi-legacy")).toBe(false);
        }
    });

    it("offers a payer with no stored method nothing at all", async () => {
        const got = await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: HOUSEHOLD }), {
            orgId: ORG,
            customerId: ACCOUNT,
            payerPersonId: "person-grandma",
        });
        expect(got).toEqual([]);
    });

    it("refuses to answer without an org, an account and a payer", async () => {
        const s = fakeSupabase({ payment_instruments: HOUSEHOLD });
        expect(await listReusableInstrumentsForPayer(s, { orgId: "", customerId: ACCOUNT, payerPersonId: MOM })).toEqual([]);
        expect(await listReusableInstrumentsForPayer(s, { orgId: ORG, customerId: "", payerPersonId: MOM })).toEqual([]);
        expect(await listReusableInstrumentsForPayer(s, { orgId: ORG, customerId: ACCOUNT, payerPersonId: "" })).toEqual([]);
    });

    it("does not reach another organization's instruments", async () => {
        const foreign = [instrument({ id: "pi-other", org_id: "org-2" })];
        const got = await listReusableInstrumentsForPayer(fakeSupabase({ payment_instruments: foreign }), {
            orgId: ORG,
            customerId: ACCOUNT,
            payerPersonId: MOM,
        });
        expect(got).toEqual([]);
    });
});

describe("an operator sees the whole account, including what nobody owns", () => {
    it("lists all three, and marks the legacy row unowned", async () => {
        const got = await listAccountInstrumentsForOperator(fakeSupabase({ payment_instruments: HOUSEHOLD }), {
            orgId: ORG,
            customerId: ACCOUNT,
        });
        expect(got).toHaveLength(3);
        const legacy = got.find((i) => i.id === "pi-legacy");
        expect(legacy?.ownerPersonId).toBeNull();
        expect(legacy?.reusable).toBe(false);
        expect(legacy?.legacyCustomerPaymentMethodId).toBe("cpm-old");
    });
});

describe("who may pay", () => {
    const EDGES = {
        customer_persons: [
            { org_id: ORG, customer_id: ACCOUNT, person_id: MOM, role_key: "parent", status: "active" },
            { org_id: ORG, customer_id: ACCOUNT, person_id: DAD, role_key: "parent", status: "active" },
            { org_id: ORG, customer_id: ACCOUNT, person_id: "person-grandma", role_key: "emergency_contact", status: "active" },
            { org_id: ORG, customer_id: ACCOUNT, person_id: "person-gone", role_key: "parent", status: "inactive" },
        ],
        persons: [
            { id: MOM, org_id: ORG, display_name: "Mom" },
            { id: DAD, org_id: ORG, display_name: "Dad" },
            { id: "person-grandma", org_id: ORG, display_name: "Grandma" },
            { id: "person-gone", org_id: ORG, display_name: "Former guardian" },
        ],
        payment_instruments: HOUSEHOLD,
    };

    /*
     * Eligibility is the household edge, not "responsible parties" and not "guardians". Grandma is
     * an emergency contact who owes nothing, and she must still be able to pay.
     */
    it("includes a non-responsible household member such as Grandma", async () => {
        const got = await resolvePayerCandidates(fakeSupabase(EDGES), { orgId: ORG, customerId: ACCOUNT });
        expect(got.map((c) => c.name).sort()).toEqual(["Dad", "Grandma", "Mom"]);
    });

    it("excludes someone whose household edge has ended", async () => {
        const got = await resolvePayerCandidates(fakeSupabase(EDGES), { orgId: ORG, customerId: ACCOUNT });
        expect(got.some((c) => c.name === "Former guardian")).toBe(false);
    });

    it("reports how many reusable instruments each payer already has", async () => {
        const got = await resolvePayerCandidates(fakeSupabase(EDGES), { orgId: ORG, customerId: ACCOUNT });
        const byName = new Map(got.map((c) => [c.name, c.reusableInstrumentCount]));
        expect(byName.get("Mom")).toBe(1);
        expect(byName.get("Dad")).toBe(1);
        // Grandma has none, and the unowned legacy row counts for nobody.
        expect(byName.get("Grandma")).toBe(0);
    });
});

describe("claiming a legacy instrument", () => {
    it("records an explicit owner and makes a card reusable", async () => {
        const rows = [instrument({ id: "pi-legacy", owner_entity_type: null, owner_entity_id: null, reusable: false })];
        const res = await claimLegacyInstrument(fakeSupabase({ payment_instruments: rows }), {
            orgId: ORG,
            instrumentId: "pi-legacy",
            ownerPersonId: MOM,
        });
        expect(res.ok).toBe(true);
        expect(rows[0].owner_entity_id).toBe(MOM);
        expect(rows[0].reusable).toBe(true);
    });

    it("refuses to re-own an instrument that already has an owner", async () => {
        const res = await claimLegacyInstrument(fakeSupabase({ payment_instruments: [instrument()] }), {
            orgId: ORG,
            instrumentId: "pi-mom",
            ownerPersonId: DAD,
        });
        expect(res).toEqual({ ok: false, reason: "This instrument already has an owner." });
    });

    /*
     * A claim cannot conjure a mandate. An unverified bank account gets an owner and stays
     * unreusable, which is also what the database's own CHECK enforces.
     */
    it("does not make an unverified bank account reusable", async () => {
        const rows = [
            instrument({
                id: "pi-bank",
                owner_entity_type: null,
                owner_entity_id: null,
                reusable: false,
                rail: "us_bank_account",
                verification_state: "mandate_required",
            }),
        ];
        const res = await claimLegacyInstrument(fakeSupabase({ payment_instruments: rows }), {
            orgId: ORG,
            instrumentId: "pi-bank",
            ownerPersonId: MOM,
        });
        expect(res.ok).toBe(true);
        expect(rows[0].owner_entity_id).toBe(MOM);
        expect(rows[0].reusable).toBe(false);
    });

    it("makes a VERIFIED bank account reusable on claim", async () => {
        const rows = [
            instrument({
                id: "pi-bank2",
                owner_entity_type: null,
                owner_entity_id: null,
                reusable: false,
                rail: "us_bank_account",
                verification_state: "verified",
            }),
        ];
        await claimLegacyInstrument(fakeSupabase({ payment_instruments: rows }), {
            orgId: ORG,
            instrumentId: "pi-bank2",
            ownerPersonId: DAD,
        });
        expect(rows[0].reusable).toBe(true);
    });

    it("refuses an instrument in another organization", async () => {
        const res = await claimLegacyInstrument(
            fakeSupabase({ payment_instruments: [instrument({ id: "pi-x", org_id: "org-2" })] }),
            { orgId: ORG, instrumentId: "pi-x", ownerPersonId: MOM },
        );
        expect(res).toEqual({ ok: false, reason: "No such payment instrument in this organisation." });
    });
});
