/**
 * THE SHARE IS THE ANCHOR, SO THE SHARE HAS TO BE VISIBLE.
 *
 * `configureExpectedFunding` refuses funding that hangs off nothing: it attaches to a responsibility
 * SHARE or one resolved allocation, never to a charge or an account. Yet the only read that surfaced
 * expected funding — the account card's — selected it by `share_id` and then DROPPED the share id
 * from what it returned. Every surface could therefore say that funding existed and none could say
 * which responsibility it funded, which is precisely how a share-grain capability gets presented as
 * an account-wide toggle and becomes unusable.
 *
 * These cases pin the grain: ids, names, and each share's own expectations.
 */
import { describe, expect, it } from "vitest";

import { readAccountArrangement } from "@/lib/financials/responsibility/readAccountArrangement";
import type { SupabaseClient } from "@supabase/supabase-js";

type Table =
    | "financial_responsibility_arrangements"
    | "financial_responsibility_shares"
    | "persons"
    | "financial_expected_funding";

type Fixture = Partial<Record<Table, Record<string, unknown>[]>> & { fail?: Table };

/** A server that answers only what it was asked, and records the filters it was asked with. */
function db(fixture: Fixture) {
    const asked: { table: Table; eq: Record<string, unknown>; is: Record<string, unknown> }[] = [];
    const from = (table: Table) => {
        const eq: Record<string, unknown> = {};
        const is: Record<string, unknown> = {};
        const ins: Record<string, string[]> = {};
        let limit: number | null = null;
        const builder = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                eq[col] = val;
                return builder;
            },
            is: (col: string, val: unknown) => {
                is[col] = val;
                return builder;
            },
            in: (col: string, vals: string[]) => {
                ins[col] = vals;
                return builder;
            },
            order: () => builder,
            limit: (n: number) => {
                limit = n;
                return builder;
            },
            then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) => {
                asked.push({ table, eq, is });
                if (fixture.fail === table) {
                    return Promise.resolve({ data: null, error: { message: "connection reset" } }).then(resolve);
                }
                let rows = (fixture[table] ?? []).filter((row) => {
                    for (const [col, val] of Object.entries(eq)) if (row[col] !== val) return false;
                    for (const [col, val] of Object.entries(is)) if ((row[col] ?? null) !== val) return false;
                    for (const [col, vals] of Object.entries(ins)) if (!vals.includes(String(row[col]))) return false;
                    return true;
                });
                if (limit != null) rows = rows.slice(0, limit);
                return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
        };
        return builder;
    };
    return { client: { from } as unknown as SupabaseClient, asked };
}

const ORG = "org-1";
const ACCOUNT = "cust-1";

const arrangement = (over: Record<string, unknown> = {}) => ({
    id: "arr-1",
    org_id: ORG,
    customer_id: ACCOUNT,
    state: "active",
    effective_start: "2026-09-11",
    effective_end: null,
    ...over,
});
const share = (id: string, partyId: string, over: Record<string, unknown> = {}) => ({
    id,
    org_id: ORG,
    arrangement_id: "arr-1",
    responsible_party_id: partyId,
    method: "fixed",
    amount_cents: 90_000,
    percent_basis_points: null,
    priority: 1,
    ...over,
});
const person = (id: string, name: string, org = ORG) => ({
    id,
    org_id: org,
    full_name: name,
    first_name: null,
    last_name: null,
});
const funding = (id: string, shareId: string, over: Record<string, unknown> = {}) => ({
    id,
    org_id: ORG,
    share_id: shareId,
    allocation_id: null,
    state: "active",
    funding_source_type: "government_subsidy",
    funding_source_label: "State subsidy",
    funding_source_reference: "agency-1",
    basis: "fixed_amount",
    expected_amount_cents: 75_000,
    percent_basis_points: null,
    ...over,
});

describe("the account arrangement, read at share grain", () => {
    it("carries the share id, which is what expected funding attaches to", async () => {
        const { client } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1")],
            persons: [person("p1", "Mei Chen")],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out?.shares.map((s) => s.id), "without the anchor the capability is unreachable").toEqual(["share-1"]);
        expect(out?.shares[0]!.amountCents).toBe(90_000);
    });

    /*
     * A SHARE NAMES A PERSON ID. An operator deciding who a funder is covering cannot read a uuid,
     * and a funding control that says "fd000000-…" is one nobody will use.
     */
    it("names the party holding each share", async () => {
        const { client } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1"), share("share-2", "p2", { priority: 2 })],
            persons: [person("p1", "Mei Chen"), person("p2", "Wei Chen")],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out?.shares.map((s) => s.name)).toEqual(["Mei Chen", "Wei Chen"]);
    });

    it("cannot name a person from another org", async () => {
        const { client, asked } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "foreign")],
            persons: [person("foreign", "Someone Else", "org-2")],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out?.shares[0]!.name, "an unnamed party is not a party wearing someone's name").toBe(
            "Responsible party",
        );
        expect(asked.find((a) => a.table === "persons")?.eq.org_id, "the org filter is load-bearing").toBe(ORG);
    });

    it("attaches each expectation to the share it is actually about", async () => {
        const { client } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1"), share("share-2", "p2")],
            persons: [person("p1", "Mei Chen"), person("p2", "Wei Chen")],
            financial_expected_funding: [
                funding("f1", "share-1"),
                funding("f2", "share-2", { funding_source_type: "employer_sponsorship", funding_source_label: "Northwind", funding_source_reference: null, expected_amount_cents: 25_000 }),
            ],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out?.shares[0]!.expectedFunding.map((f) => f.id)).toEqual(["f1"]);
        expect(out?.shares[1]!.expectedFunding.map((f) => f.id)).toEqual(["f2"]);
        expect(out?.shares[0]!.expectedFunding[0]!.reference, "the agency's canonical id travels").toBe("agency-1");
    });

    /*
     * A SUPERSEDED EXPECTATION IS HISTORY. Summing it with its replacement would state a funder
     * covering the same money twice — the exact defect the service's new supersession prevents,
     * pinned here at the read so a future edit cannot reintroduce it by widening a filter.
     */
    it("shows only the live expectation, never the one it replaced", async () => {
        const { client } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1")],
            persons: [person("p1", "Mei Chen")],
            financial_expected_funding: [
                funding("old", "share-1", { state: "superseded", expected_amount_cents: 75_000 }),
                funding("new", "share-1", { expected_amount_cents: 65_000 }),
            ],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out?.shares[0]!.expectedFunding.map((f) => f.id)).toEqual(["new"]);
    });

    /*
     * ALLOCATION-ANCHORED ROWS ARE THE RESOLUTION MACHINERY'S, not the operator's. Mixing them in
     * would show a per-period figure beside a durable one and invite an operator to "correct" a row
     * the machine owns.
     */
    it("ignores per-period allocation-anchored funding", async () => {
        const { client } = db({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1")],
            persons: [person("p1", "Mei Chen")],
            financial_expected_funding: [funding("per-period", "share-1", { allocation_id: "alloc-9" })],
        });
        const out = await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out?.shares[0]!.expectedFunding).toEqual([]);
    });

    it("answers nothing for an account with no arrangement, and asks nothing further", async () => {
        const { client, asked } = db({ financial_responsibility_arrangements: [] });
        expect(await readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT })).toBeNull();
        expect(asked.some((a) => a.table === "financial_responsibility_shares")).toBe(false);
    });

    /*
     * FAIL CLOSED. "There is no arrangement" and "nothing funds this share" are both sentences an
     * operator acts on. Neither may be said about a record that was not read.
     */
    it("throws rather than reporting an unreadable arrangement as absent", async () => {
        const { client } = db({ fail: "financial_responsibility_arrangements" });
        await expect(readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT })).rejects.toThrow(
            /arrangement could not be read/i,
        );
    });

    it("throws rather than reporting unreadable funding as none", async () => {
        const { client } = db({
            fail: "financial_expected_funding",
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share("share-1", "p1")],
            persons: [person("p1", "Mei Chen")],
        });
        await expect(readAccountArrangement(client, { orgId: ORG, customerId: ACCOUNT })).rejects.toThrow(
            /expected funding could not be read/i,
        );
    });
});
