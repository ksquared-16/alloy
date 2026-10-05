/**
 * W7-F002 — RECORDING WHO AN ACCOUNT BELONGS TO, WITHOUT EVER GUESSING.
 *
 * The identity bridge has had one reader and zero writers since it was created, which is why the
 * deployed estate holds 13 money-capable users and 0 links. This is the write half, and the cases
 * that matter are the refusals: the service must be incapable of inferring a link, and incapable of
 * recording one that leaves the audit trail exactly as mute as before.
 */
import { describe, expect, it } from "vitest";

import {
    UserPersonLinkError,
    createUserPersonLink,
    listUserPersonLinkState,
} from "@/lib/access/userPersonLinkService";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function makeDb(seed: { links?: Row[]; roles?: Row[]; persons?: Row[] }) {
    const tables: Record<string, Row[]> = {
        user_person_links: (seed.links ?? []).map((r) => ({ ...r })),
        user_roles: (seed.roles ?? []).map((r) => ({ ...r })),
        persons: (seed.persons ?? []).map((r) => ({ ...r })),
    };
    const inserted: Row[] = [];

    function builder(table: string) {
        const rows = tables[table];
        if (!rows) throw new Error(`unexpected table ${table}`);
        const eqs: Array<[string, unknown]> = [];
        const ins: Array<[string, unknown[]]> = [];
        const nulls: string[] = [];
        let payload: Row | null = null;

        const matching = () =>
            rows.filter(
                (r) =>
                    eqs.every(([c, v]) => r[c] === v)
                    && ins.every(([c, vs]) => vs.includes(r[c] as never))
                    && nulls.every((c) => r[c] == null),
            );

        const api: Record<string, unknown> = {
            select: () => api,
            insert: (p: Row) => { payload = p; return api; },
            eq: (c: string, v: unknown) => { eqs.push([c, v]); return api; },
            in: (c: string, v: unknown[]) => { ins.push([c, v]); return api; },
            is: (c: string) => { nulls.push(c); return api; },
            maybeSingle: async () => {
                const hit = matching();
                return { data: hit.length ? { ...hit[0] } : null, error: null };
            },
            single: async () => {
                if (payload) {
                    /* The partial unique indexes, as the database would apply them. */
                    const clash = rows.some(
                        (r) =>
                            r.org_id === payload!.org_id
                            && r.status === "active"
                            && (r.user_id === payload!.user_id || r.person_id === payload!.person_id),
                    );
                    if (clash) return { data: null, error: { code: "23505", message: "duplicate key" } };
                    const row = { id: "link-1", linked_at: "2026-10-05T00:00:00.000Z", ...payload };
                    rows.push(row);
                    inserted.push(row);
                    return { data: row, error: null };
                }
                const hit = matching();
                return { data: hit.length ? { ...hit[0] } : null, error: null };
            },
        };
        (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: matching().map((r) => ({ ...r })), error: null }));
        return api;
    }
    return { client: { from: (t: string) => builder(t) } as never, tables, inserted };
}

const namedPerson = { id: PERSON, org_id: ORG, full_name: "Dana Okonkwo", first_name: null, last_name: null, archived_at: null };

describe("createUserPersonLink refuses to guess", () => {
    it("requires both ids explicitly", async () => {
        const db = makeDb({ persons: [namedPerson] });
        for (const args of [
            { userId: "", personId: PERSON },
            { userId: USER, personId: "" },
        ]) {
            await expect(
                createUserPersonLink(db.client, { orgId: ORG, note: "W7 identity", linkedBy: null, ...args }),
            ).rejects.toThrow(/required: a link is never inferred/);
        }
    });

    it("requires a recorded reason", async () => {
        const db = makeDb({ persons: [namedPerson] });
        await expect(
            createUserPersonLink(db.client, { orgId: ORG, userId: USER, personId: PERSON, note: "", linkedBy: null }),
        ).rejects.toThrow(/note is required/);
    });

    it("refuses a person in another organisation", async () => {
        const db = makeDb({ persons: [{ ...namedPerson, org_id: OTHER_ORG }] });
        const error = await createUserPersonLink(db.client, {
            orgId: ORG, userId: USER, personId: PERSON, note: "W7 identity", linkedBy: null,
        }).then(() => null, (e) => e as UserPersonLinkError);
        expect(error?.status).toBe(403);
        expect(String(error)).toContain("another organisation");
    });

    it("refuses a person who carries no name, because the link would prove nothing", async () => {
        /*
         * The requirement is a NAMED human, not merely a link. A link to an unnamed person records
         * a decision and leaves the ledger exactly as unable to say who acted.
         */
        const db = makeDb({ persons: [{ ...namedPerson, full_name: "  " }] });
        const error = await createUserPersonLink(db.client, {
            orgId: ORG, userId: USER, personId: PERSON, note: "W7 identity", linkedBy: null,
        }).then(() => null, (e) => e as UserPersonLinkError);
        expect(error?.status).toBe(409);
        expect(String(error)).toContain("carries no name");
    });

    it("refuses an archived person and a person who does not exist", async () => {
        const archived = makeDb({ persons: [{ ...namedPerson, archived_at: "2026-01-01T00:00:00Z" }] });
        await expect(createUserPersonLink(archived.client, {
            orgId: ORG, userId: USER, personId: PERSON, note: "W7 identity", linkedBy: null,
        })).rejects.toThrow(/archived/);

        const missing = makeDb({ persons: [] });
        await expect(createUserPersonLink(missing.client, {
            orgId: ORG, userId: USER, personId: PERSON, note: "W7 identity", linkedBy: null,
        })).rejects.toThrow(/No such person/);
    });

    it("records the link, with its reason and who decided it", async () => {
        const db = makeDb({ persons: [namedPerson] });
        const link = await createUserPersonLink(db.client, {
            orgId: ORG, userId: USER, personId: PERSON, note: "W7 staging identity cleanup", linkedBy: "admin-1",
        });
        expect(link).toMatchObject({ userId: USER, personId: PERSON, status: "active" });
        expect(db.inserted[0]).toMatchObject({
            note: "W7 staging identity cleanup", linked_by: "admin-1", org_id: ORG,
        });
    });

    it("reports both cardinality collisions as refusals rather than faults", async () => {
        /* One active person per user, and one active user per person. Both directions matter. */
        const existing = {
            id: "link-0", org_id: ORG, user_id: USER, person_id: PERSON, status: "active", linked_at: null,
        };
        for (const attempt of [
            { userId: USER, personId: "55555555-5555-4555-8555-555555555555" },
            { userId: "66666666-6666-4666-8666-666666666666", personId: PERSON },
        ]) {
            const db = makeDb({
                links: [existing],
                persons: [namedPerson, { ...namedPerson, id: "55555555-5555-4555-8555-555555555555" }],
            });
            const error = await createUserPersonLink(db.client, {
                orgId: ORG, note: "W7 identity", linkedBy: null, ...attempt,
            }).then(() => null, (e) => e as UserPersonLinkError);
            expect(error?.status).toBe(409);
            expect(String(error)).toContain("already linked");
        }
    });
});

describe("listUserPersonLinkState", () => {
    it("names the money-capable accounts the ledger cannot attribute", async () => {
        const db = makeDb({
            links: [{ id: "l1", org_id: ORG, user_id: "resolved-user", person_id: PERSON, status: "active", linked_at: null }],
            roles: [
                { org_id: ORG, user_id: "resolved-user", role: "admin" },
                { org_id: ORG, user_id: USER, role: "admin" },
                { org_id: ORG, user_id: USER, role: "ops" },
                /* A role that cannot move money is not this route's business. */
                { org_id: ORG, user_id: "viewer", role: "viewer" },
                /* Nor is another tenant's administrator. */
                { org_id: OTHER_ORG, user_id: "elsewhere", role: "owner" },
            ],
            persons: [namedPerson, { ...namedPerson, id: "unnamed-person", full_name: null }],
        });
        const state = await listUserPersonLinkState(db.client, { orgId: ORG });
        expect(state.unresolvedMoneyCapableActors).toEqual([{ userId: USER, roles: ["admin", "ops"] }]);
        expect(state.links).toHaveLength(1);
        /* An unnamed person is not offered, because linking to one satisfies nothing. */
        expect(state.linkCandidates.map((c) => c.personId)).toEqual([PERSON]);
    });

    it("returns no identifying detail about an unresolved account beyond its id and roles", async () => {
        /*
         * Deliberate. "Which accounts are unresolved" is the question; who they might be is the
         * Users surface's, and an email here would invite exactly the matching this service refuses.
         */
        const db = makeDb({ roles: [{ org_id: ORG, user_id: USER, role: "admin" }] });
        const state = await listUserPersonLinkState(db.client, { orgId: ORG });
        expect(Object.keys(state.unresolvedMoneyCapableActors[0]!).sort()).toEqual(["roles", "userId"]);
    });
});
