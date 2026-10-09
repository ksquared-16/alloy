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
    replaceUserPersonLink,
    revokeUserPersonLink,
} from "@/lib/access/userPersonLinkService";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

/* What each role allows, as `role_permission_grants` holds it — money capability is read from here. */
const GRANTS: Row[] = [
    { org_id: ORG, role_key: "admin", permission_key: "fin.write", allowed: true },
    { org_id: ORG, role_key: "ops", permission_key: "fin.adjust", allowed: true },
    { org_id: ORG, role_key: "viewer", permission_key: "fin.read", allowed: true },
    { org_id: ORG, role_key: "bookkeeper", permission_key: "fin.write", allowed: true },
    { org_id: ORG, role_key: "lapsed", permission_key: "fin.write", allowed: false },
];

function makeDb(seed: { links?: Row[]; roles?: Row[]; persons?: Row[]; rpc?: (fn: string, p: Row) => unknown }) {
    const tables: Record<string, Row[]> = {
        user_person_links: (seed.links ?? []).map((r) => ({ ...r })),
        user_roles: (seed.roles ?? []).map((r) => ({ ...r })),
        role_permission_grants: GRANTS.map((r) => ({ ...r })),
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
    const rpcCalls: Array<[string, Row]> = [];
    const rpc = async (fn: string, p: Row) => {
        rpcCalls.push([fn, p]);
        return seed.rpc ? seed.rpc(fn, p) : { data: null, error: { message: `unknown rpc ${fn}` } };
    };
    return { client: { from: (t: string) => builder(t), rpc } as never, tables, inserted, rpcCalls };
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
                /* Nor is a role whose money grant is not allowed. */
                { org_id: ORG, user_id: "lapsed-user", role: "lapsed" },
                /* A custom role holding fin.write IS money-capable: a capability, not a role name. */
                { org_id: ORG, user_id: "bookkeeper-user", role: "bookkeeper" },
                /* Nor is another tenant's administrator. */
                { org_id: OTHER_ORG, user_id: "elsewhere", role: "owner" },
            ],
            persons: [
                namedPerson,
                { ...namedPerson, id: "free-person", full_name: "Rae Lindqvist" },
                { ...namedPerson, id: "unnamed-person", full_name: null },
            ],
        });
        const state = await listUserPersonLinkState(db.client, { orgId: ORG });
        expect(state.unresolvedMoneyCapableActors).toEqual([
            { userId: USER, roles: ["admin", "ops"], capabilities: ["fin.adjust", "fin.write"] },
            { userId: "bookkeeper-user", roles: ["bookkeeper"], capabilities: ["fin.write"] },
        ]);
        expect(state.links).toHaveLength(1);
        /* The surface shows WHO a login is linked to, by name. */
        expect(state.links[0]!.personName).toBe("Dana Okonkwo");
        /* An unnamed person is not offered, nor one already answering to another login. */
        expect(state.linkCandidates.map((c) => c.personId)).toEqual(["free-person"]);
    });

    it("returns no identifying detail about an unresolved account beyond its id and roles", async () => {
        /*
         * Deliberate. "Which accounts are unresolved" is the question; who they might be is the
         * Users surface's, and an email here would invite exactly the matching this service refuses.
         */
        const db = makeDb({ roles: [{ org_id: ORG, user_id: USER, role: "admin" }] });
        const state = await listUserPersonLinkState(db.client, { orgId: ORG });
        expect(Object.keys(state.unresolvedMoneyCapableActors[0]!).sort()).toEqual(["capabilities", "roles", "userId"]);
    });
});

describe("revoke and replace (W7-F002)", () => {
    it("refuses to revoke the link of someone who can still move money", async () => {
        const db = makeDb({
            rpc: () => ({ data: null, error: { message: "person_link_required_for_money_capability: this user holds a money-capable capability" } }),
        });
        await expect(
            revokeUserPersonLink(db.client, { orgId: ORG, userId: USER, note: "left the org", revokedBy: null }),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("requires a recorded reason to revoke", async () => {
        const db = makeDb({});
        await expect(revokeUserPersonLink(db.client, { orgId: ORG, userId: USER, note: " ", revokedBy: null })).rejects.toBeInstanceOf(UserPersonLinkError);
        expect(db.rpcCalls).toHaveLength(0);
    });

    it("replaces atomically, through the database, after checking the new person like any link", async () => {
        const db = makeDb({
            persons: [namedPerson],
            rpc: (_fn, p) => ({ data: { id: "link-2", user_id: p.p_user_id, person_id: p.p_person_id, status: "active", linked_at: "2026-10-09" }, error: null }),
        });
        const link = await replaceUserPersonLink(db.client, { orgId: ORG, userId: USER, personId: PERSON, note: "wrong person before", linkedBy: "admin-1" });
        expect(link).toMatchObject({ userId: USER, personId: PERSON, status: "active" });
        expect(db.rpcCalls).toEqual([["replace_user_person_link", {
            p_org_id: ORG, p_user_id: USER, p_person_id: PERSON, p_actor_user_id: "admin-1", p_note: "wrong person before",
        }]]);
    });

    it("never replaces onto an unnamed person", async () => {
        const db = makeDb({ persons: [{ ...namedPerson, full_name: null }], rpc: () => ({ data: {}, error: null }) });
        await expect(
            replaceUserPersonLink(db.client, { orgId: ORG, userId: USER, personId: PERSON, note: "wrong person", linkedBy: null }),
        ).rejects.toMatchObject({ status: 409 });
        expect(db.rpcCalls).toHaveLength(0);
    });
});
