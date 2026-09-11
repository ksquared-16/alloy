/**
 * WHO THE PICKER OFFERS — and, more importantly, who it must not.
 *
 * ── THE DEFECT THIS EXISTS TO CATCH ──
 *
 * Manage Responsibility read its list of people from `/api/admin/contact-options`, which reads the
 * `contacts` table. That table holds ZERO rows across the entire tenant. So every account in the
 * product offered an empty picker, the operator was told "nobody on this account can be made
 * responsible yet", and the capability Thread 6 built could not be reached from any household — a
 * registered action with no path to it. Registration is not productization.
 *
 * The repair reads the canonical household edge, `customer_persons`, which holds 1,802 rows. These
 * cases pin both halves of that: the people who must appear, and the people who must not.
 *
 * Hermetic — the "database" is a function, so "a child is never offered" is proven on every run
 * rather than depending on a tenant that happens to contain a child.
 */
import { describe, expect, it } from "vitest";

import { resolveResponsibilityPartyCandidates } from "@/lib/financials/responsibility/responsibilityPartyCandidates";
import type { SupabaseClient } from "@supabase/supabase-js";

type Table = "financial_responsibility_allocations" | "customer_persons" | "persons";
type Fixture = Partial<Record<Table, Record<string, unknown>[]>> & {
    fail?: Table;
};

/**
 * A server that answers only what it was actually asked. Filters are RECORDED rather than ignored,
 * because the org filter on `persons` is the thing standing between a foreign id and a name on the
 * operator's screen — a mock that quietly returns every row would prove the opposite of the claim.
 */
function db(fixture: Fixture) {
    const asked: { table: Table; filters: Record<string, unknown>; ins: Record<string, string[]> }[] = [];
    const from = (table: Table) => {
        const filters: Record<string, unknown> = {};
        const ins: Record<string, string[]> = {};
        const builder = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                filters[col] = val;
                return builder;
            },
            in: (col: string, vals: string[]) => {
                ins[col] = vals;
                return builder;
            },
            then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) => {
                asked.push({ table, filters, ins });
                if (fixture.fail === table) {
                    return Promise.resolve({ data: null, error: { message: "URI too long" } }).then(resolve);
                }
                const rows = (fixture[table] ?? []).filter((row) => {
                    for (const [col, val] of Object.entries(filters)) if (row[col] !== val) return false;
                    for (const [col, vals] of Object.entries(ins)) if (!vals.includes(String(row[col]))) return false;
                    return true;
                });
                return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
        };
        return builder;
    };
    return { client: { from } as unknown as SupabaseClient, asked };
}

const ORG = "org-1";
const OTHER_ORG = "org-2";
const ACCOUNT = "cust-1";

const person = (id: string, first: string, last: string, org = ORG) => ({
    id,
    org_id: org,
    full_name: null,
    first_name: first,
    last_name: last,
});
const edge = (personId: string, role: string, opts: { customer?: string; org?: string; status?: string } = {}) => ({
    org_id: opts.org ?? ORG,
    customer_id: opts.customer ?? ACCOUNT,
    person_id: personId,
    role_type: role,
    is_primary: false,
    status: opts.status ?? "active",
});

describe("the responsibility party candidates", () => {
    it("offers the household's adults from the canonical customer edge", async () => {
        const { client } = db({
            customer_persons: [edge("p1", "parent"), edge("p2", "guardian")],
            persons: [person("p1", "Mei", "Chen"), person("p2", "Wei", "Chen")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out.map((c) => c.personId).sort()).toEqual(["p1", "p2"]);
        expect(out.map((c) => c.name).sort()).toEqual(["Mei Chen", "Wei Chen"]);
        expect(out.every((c) => c.holdsShare === false)).toBe(true);
    });

    /*
     * THE EXCLUSION IS BY NAME. `child` is a role the org's own vocabulary defines, so this is not
     * an inference from age, table or absence of an email — it is the household saying so.
     */
    it("never offers a child, whatever else is on the account", async () => {
        const { client } = db({
            customer_persons: [edge("kid", "child"), edge("p1", "parent")],
            persons: [person("kid", "Lily", "Chen"), person("p1", "Mei", "Chen")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out.map((c) => c.personId)).toEqual(["p1"]);
        expect(out.some((c) => c.name.includes("Lily")), "a child may not be made to owe their own tuition").toBe(false);
    });

    /*
     * TWO ROLES IS NOT TWO PEOPLE. A parent who is also the payer appeared twice in the first draft
     * of the picker, and an operator assigning a fixed amount to each would have doubled the family's
     * obligation without ever seeing why.
     */
    it("returns one row per person even when they hold several roles", async () => {
        const { client } = db({
            customer_persons: [edge("p1", "parent"), edge("p1", "payer"), edge("p1", "primary_contact")],
            persons: [person("p1", "Mei", "Chen")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out.length).toBe(1);
        expect(out[0].roleLabel, "the first role read is the one shown").toBe("Parent");
    });

    /*
     * AN ARRANGEMENT MUST STAY EDITABLE. The household edge can end — a separation, a guardian
     * change — while the responsibility share stands. If the person holding it vanished from the
     * picker, the only way to correct the money would be to not use the product.
     */
    it("keeps an existing share-holder who is no longer on the household", async () => {
        const { client } = db({
            financial_responsibility_allocations: [
                { org_id: ORG, state: "active", charge_id: "chg-1", responsible_party_id: "former" },
            ],
            customer_persons: [edge("p1", "parent")],
            persons: [person("former", "Dana", "Alvarez"), person("p1", "Mei", "Chen")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, {
            orgId: ORG,
            customerId: ACCOUNT,
            chargeIds: ["chg-1"],
        });

        expect(out.map((c) => c.personId)).toEqual(["former", "p1"]);
        expect(out[0].holdsShare, "the party already bearing the money leads the list").toBe(true);
        expect(out[1].holdsShare).toBe(false);
    });

    it("does not count a reversed or superseded allocation as a current party", async () => {
        const { client } = db({
            financial_responsibility_allocations: [
                { org_id: ORG, state: "superseded", charge_id: "chg-1", responsible_party_id: "old" },
            ],
            customer_persons: [edge("p1", "parent")],
            persons: [person("old", "Sam", "Okafor"), person("p1", "Mei", "Chen")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, {
            orgId: ORG,
            customerId: ACCOUNT,
            chargeIds: ["chg-1"],
        });
        expect(out.map((c) => c.personId)).toEqual(["p1"]);
    });

    /*
     * TENANCY. The list narrows; the arrangement service is what refuses. But a foreign person must
     * not reach the operator WEARING A NAME either — a named row is what makes a wrong pick look
     * like a right one.
     */
    it("cannot name a person belonging to another org", async () => {
        const { client, asked } = db({
            customer_persons: [edge("foreign", "parent")],
            persons: [person("foreign", "Someone", "Else", OTHER_ORG)],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });

        expect(out, "a person outside the caller's org is not a candidate").toEqual([]);
        expect(asked.find((a) => a.table === "persons")?.filters.org_id, "the org filter is load-bearing").toBe(ORG);
    });

    it("does not read another account's household", async () => {
        const { client } = db({
            customer_persons: [edge("p1", "parent"), edge("p9", "parent", { customer: "cust-other" })],
            persons: [person("p1", "Mei", "Chen"), person("p9", "Not", "Ours")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out.map((c) => c.personId)).toEqual(["p1"]);
    });

    it("ignores an ended household relationship", async () => {
        const { client } = db({
            customer_persons: [edge("p1", "parent"), edge("gone", "parent", { status: "inactive" })],
            persons: [person("p1", "Mei", "Chen"), person("gone", "Past", "Guardian")],
        });
        const out = await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT });
        expect(out.map((c) => c.personId)).toEqual(["p1"]);
    });

    it("asks nobody, and answers nobody, for an account that does not exist", async () => {
        const { client, asked } = db({ persons: [person("p1", "Mei", "Chen")] });
        expect(await resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: null })).toEqual([]);
        expect(asked.some((a) => a.table === "persons"), "no ids means no name lookup").toBe(false);
    });

    /*
     * A FAILED READ MUST NOT BECOME AN EMPTY HOUSEHOLD. "Nobody on this account can be made
     * responsible" is a sentence an operator believes. It must only ever be said about a household
     * that was actually read.
     */
    it("throws rather than reporting an unreadable household as empty", async () => {
        const { client } = db({ fail: "customer_persons", customer_persons: [edge("p1", "parent")] });
        await expect(
            resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT }),
        ).rejects.toThrow(/household could not be read/i);
    });

    it("throws rather than losing the parties already bearing the money", async () => {
        const { client } = db({ fail: "financial_responsibility_allocations" });
        await expect(
            resolveResponsibilityPartyCandidates(client, { orgId: ORG, customerId: ACCOUNT, chargeIds: ["chg-1"] }),
        ).rejects.toThrow(/current parties could not be read/i);
    });
});
