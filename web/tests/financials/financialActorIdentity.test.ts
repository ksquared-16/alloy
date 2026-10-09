import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * W7-F002 — A USER WHO MOVES MONEY MUST RESOLVE TO A RECOGNISABLE HUMAN.
 *
 * The Director's decision is that "Created by a person whose name is not on file" is not acceptable
 * financial attribution in a steady-state product. These cases pin the requirement rather than the
 * display: the distinction matters because a surface may still show a weak name from the auth
 * account while the requirement is unmet, and a product that reported THAT as met would have closed
 * the gap on screen and left it open in the data.
 *
 * The two things that must never happen are asserted directly: email is never a name, and an
 * unreadable lookup is never reported as a met requirement OR as a missing link.
 */
import { describe, expect, it } from "vitest";

import {
    MONEY_CAPABLE_CAPABILITY_KEYS,
    financialActorIdentityGap,
    personDisplayName,
    resolveFinancialActorIdentity,
} from "@/lib/financials/identity/financialActorIdentity";

const ORG = "org-1";

type Link = { user_id: string; person_id: string; status: string; org_id: string };
type Person = { id: string; org_id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null };

function makeDb(seed: { links?: Link[]; persons?: Person[]; failLinks?: boolean; failPersons?: boolean }) {
    function builder(table: string) {
        const eqs: Array<[string, unknown]> = [];
        const api: Record<string, unknown> = {
            select: () => api,
            eq: (c: string, v: unknown) => { eqs.push([c, v]); return api; },
            limit: () => api,
            maybeSingle: async () => {
                if (table !== "persons") throw new Error(`unexpected maybeSingle on ${table}`);
                if (seed.failPersons) return { data: null, error: { message: "boom" } };
                const hit = (seed.persons ?? []).find((p) =>
                    eqs.every(([c, v]) => (p as unknown as Record<string, unknown>)[c] === v));
                return { data: hit ?? null, error: null };
            },
        };
        (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => {
            if (table !== "user_person_links") throw new Error(`unexpected list on ${table}`);
            if (seed.failLinks) return Promise.resolve(resolve({ data: null, error: { message: "boom" } }));
            const hit = (seed.links ?? []).filter((l) =>
                eqs.every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v));
            return Promise.resolve(resolve({ data: hit, error: null }));
        };
        return api;
    }
    return { from: (t: string) => builder(t) } as never;
}

describe("resolveFinancialActorIdentity", () => {
    it("resolves through the canonical bridge to a named human", async () => {
        const db = makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "active", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, full_name: "Dana Okonkwo" }],
        });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity).toEqual({
            status: "named", name: "Dana Okonkwo", personId: "p1", requirementMet: true,
        });
        expect(financialActorIdentityGap(identity)).toBeNull();
    });

    it("composes a name from first and last when there is no full name", async () => {
        const db = makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "active", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, full_name: null, first_name: "Dana", last_name: "Okonkwo" }],
        });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity.name).toBe("Dana Okonkwo");
        expect(identity.requirementMet).toBe(true);
    });

    it("an unlinked operator is an unmet requirement, and the sentence says where it is closed", async () => {
        /* The deployed census: 4 financial actors, 0 with an active link, 0 resolving to a name. */
        const db = makeDb({ links: [], persons: [] });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity.status).toBe("not_linked");
        expect(identity.requirementMet).toBe(false);
        expect(financialActorIdentityGap(identity)).toContain("Access");
    });

    it("a REVOKED link is not a link", async () => {
        const db = makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "revoked", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, full_name: "Dana Okonkwo" }],
        });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity.status).toBe("not_linked");
        expect(identity.name).toBeNull();
    });

    it("a link to a person who carries no name is linked and still unnamed", async () => {
        const db = makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "active", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, full_name: "   ", first_name: null, last_name: null }],
        });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity.status).toBe("person_unnamed");
        expect(identity.personId).toBe("p1");
        expect(identity.requirementMet).toBe(false);
    });

    it("a link to a person who is gone is a fault, not an omission", async () => {
        const db = makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "active", org_id: ORG }],
            persons: [],
        });
        const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
        expect(identity.status).toBe("person_missing");
        expect(financialActorIdentityGap(identity)).toContain("no longer exists");
    });

    it("an unreadable lookup is neither met nor evidence that nobody is linked", async () => {
        /*
         * The distinction `linkedPersonIdentity` exists to make. Reporting a failed read as
         * "not linked" would put a confident, wrong sentence on a financial audit line.
         */
        for (const db of [makeDb({ failLinks: true }), makeDb({
            links: [{ user_id: "u1", person_id: "p1", status: "active", org_id: ORG }],
            failPersons: true,
        })]) {
            const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId: "u1" });
            expect(identity.status).toBe("unreadable");
            expect(identity.requirementMet).toBe(false);
            expect(financialActorIdentityGap(identity)).toContain("could not be read");
        }
    });

    it("no actor at all is not an identity gap", async () => {
        /* An automatic charge has nobody to name, and inventing a gap for it would fill the
         * operator's attention with rows nobody can act on. */
        const db = makeDb({});
        for (const actorUserId of [null, undefined, "", "  "]) {
            const identity = await resolveFinancialActorIdentity(db, { orgId: ORG, actorUserId });
            expect(identity.status).toBe("no_actor");
            expect(financialActorIdentityGap(identity)).toBeNull();
        }
    });
});

describe("personDisplayName", () => {
    it("never promotes an address or a placeholder into a name", () => {
        expect(personDisplayName({ full_name: null, first_name: null, last_name: null })).toBeNull();
        expect(personDisplayName({ full_name: "" })).toBeNull();
        expect(personDisplayName(null)).toBeNull();
        /*
         * And an address is not a name even when it is the only text available. `operatorIdentity`
         * underneath never promotes an email into `name`, and this is the financial surface where
         * that rule has to hold: an audit line saying "Created by billing@" names an inbox.
         */
        expect(personDisplayName({ full_name: null, first_name: "  ", last_name: "  " })).toBeNull();
    });
});

describe("the capability the requirement attaches to", () => {
    it("is a capability set, the same one the grant-time rule enforces (W7-F002)", () => {
        expect([...MONEY_CAPABLE_CAPABILITY_KEYS]).toEqual([
            "fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy", "fin.provider", "fin.post",
        ]);
        const sql = readFileSync(
            resolve(__dirname, "../../../supabase/migrations/20261122140000_money_capable_grant_requires_person_link.sql"),
            "utf8",
        );
        expect(sql).toContain("ARRAY['fin.write', 'fin.adjust', 'fin.responsibility', 'fin.subsidy', 'fin.provider', 'fin.post']");
    });
});
