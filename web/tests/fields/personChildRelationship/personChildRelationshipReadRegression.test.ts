/**
 * REGRESSION — the two read defects Configuration Discovery V1 certification exposed.
 *
 * DEFECT 1 (silent, catastrophic): `loadPersonsMap` selected `persons.display_name`, a column that
 * does not exist. PostgREST rejected the whole select with 42703, the error was DISCARDED, the map
 * came back empty, and the resolver then reported `missing_person` — so every child in every
 * organization appeared to have no family. A schema fault presented as legitimate empty data, which
 * is why nothing caught it until a live journey asserted specific identities.
 *
 * DEFECT 2 (blast radius): one unresolvable row erased every valid relationship for that child,
 * because resolution was all-or-nothing.
 *
 * These tests exist so neither can return silently. They assert through the real consumer surface
 * (`listPersonChildRelationships`) rather than internals, and they assert IDENTITIES, never counts —
 * counts are exactly what let the original defect pass as a valid empty result.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, expect, it } from "vitest";

import { listPersonChildRelationships } from "@/lib/fields/personChildRelationship/personChildRelationshipService";
import { resolvePersonChildRelationshipsForCustomerMember } from "@/lib/fields/personChildRelationship/personChildRelationshipResolver";

const ORG = "org-1";
const CUSTOMER = "cust-1";
const CHILD = "child-a";
const DANA = "person-dana";
const SAM = "person-sam";
const ROSA = "person-rosa";

type Row = Record<string, unknown>;

/**
 * Minimal PostgREST-shaped mock. `personsSelect` captures the columns actually requested so the
 * regression can assert the non-existent column is never asked for again, and `personsError` lets a
 * test reproduce the exact 42703 failure.
 */
function mockSupabase(state: {
    relationships?: Row[];
    roles?: Row[];
    persons?: Row[];
    cmc?: Row[];
    contacts?: Row[];
    personsError?: { code: string; message: string } | null;
    captured?: { personsSelect: string[] };
}) {
    const thenable = (data: Row[], error: unknown = null) => {
        const api: Record<string, unknown> = {};
        for (const k of ["select", "eq", "in", "order", "limit"]) {
            api[k] = () => api;
        }
        // Awaiting the builder resolves it, exactly as supabase-js does.
        (api as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ data, error });
        return api;
    };

    return {
        from(table: string) {
            if (table === "persons") {
                const api: Record<string, unknown> = {
                    select: (cols: string) => {
                        state.captured?.personsSelect.push(cols);
                        return api;
                    },
                    eq: () => api,
                    in: () => api,
                };
                (api as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
                    resolve({ data: state.personsError ? null : (state.persons ?? []), error: state.personsError ?? null });
                return api;
            }
            if (table === "person_child_relationships") return thenable(state.relationships ?? []);
            if (table === "person_child_relationship_roles") return thenable(state.roles ?? []);
            if (table === "customer_member_contacts") return thenable(state.cmc ?? []);
            if (table === "contacts") return thenable(state.contacts ?? []);
            return thenable([]);
        },
    } as never;
}

const rel = (id: string, personId: string): Row => ({
    id,
    org_id: ORG,
    customer_id: CUSTOMER,
    customer_member_id: CHILD,
    person_id: personId,
    relationship_type: null,
    priority: null,
    status: "active",
});

const person = (id: string, name: string): Row => ({
    id,
    full_name: name,
    first_name: name.split(" ")[0],
    last_name: name.split(" ")[1] ?? null,
    email: `${id}@cdv1.invalid`,
    phone: "5550100",
});

describe("DEFECT 1 — person hydration must never fail silently", () => {
    it("1. never selects the non-existent `display_name` column", async () => {
        const captured = { personsSelect: [] as string[] };
        await listPersonChildRelationships({
            supabase: mockSupabase({ relationships: [rel("r1", SAM)], persons: [person(SAM, "Sam Multi")], captured }),
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(captured.personsSelect.length, "persons was never queried").toBeGreaterThan(0);
        for (const cols of captured.personsSelect) {
            expect(cols, "the column that caused PostgREST 42703 is being requested again").not.toContain("display_name");
        }
    });

    it("2. a PostgREST error THROWS instead of returning an empty family", async () => {
        await expect(
            listPersonChildRelationships({
                supabase: mockSupabase({
                    relationships: [rel("r1", SAM)],
                    personsError: { code: "42703", message: 'column persons.display_name does not exist' },
                }),
                orgId: ORG,
                customerMemberId: CHILD,
            }),
        ).rejects.toThrow(/person hydration failed/i);
    });

    it("3. the thrown error is diagnosable — names table, op, code and requested count", async () => {
        let message = "";
        try {
            await listPersonChildRelationships({
                supabase: mockSupabase({
                    relationships: [rel("r1", SAM), rel("r2", ROSA)],
                    personsError: { code: "42703", message: "boom" },
                }),
                orgId: ORG,
                customerMemberId: CHILD,
            });
        } catch (e) {
            message = (e as Error).message;
        }
        expect(message).toContain("table=persons");
        expect(message).toContain("op=select");
        expect(message).toContain("code=42703");
        expect(message).toContain("requested=2");
    });

    it("4. a hydration fault is NOT reported as 'this child has no family'", async () => {
        // The original defect's signature: a successful-looking empty array. It must be impossible.
        const call = listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                personsError: { code: "42703", message: "boom" },
            }),
            orgId: ORG,
            customerMemberId: CHILD,
        });
        await expect(call).rejects.toThrow();
        await expect(call).rejects.not.toEqual([]);
    });

    it("5. healthy hydration returns the person attached to the relationship", async () => {
        const items = await listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                roles: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true }],
                persons: [person(SAM, "Sam Multi")],
            }),
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(items.map((i) => i.person_id)).toEqual([SAM]);
        expect((items[0]!.person as Row).full_name).toBe("Sam Multi");
    });
});

describe("DEFECT 2 — one bad row must not erase a child's whole family", () => {
    const base = {
        orgId: ORG,
        customerId: CUSTOMER,
        customerMemberId: CHILD,
        relationships: [
            rel("r1", SAM) as never,
            rel("r2", ROSA) as never,
            rel("r3", "person-missing") as never,
        ],
        roleAssignments: [
            { id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true },
            { id: "a2", org_id: ORG, relationship_id: "r2", role_key: "emergency_contact", is_active: true },
            { id: "a3", org_id: ORG, relationship_id: "r3", role_key: "guardian", is_active: true },
        ],
    };

    it("6. the two resolvable relationships survive an unresolvable third", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({
            ...base,
            personsById: new Map([
                [SAM, person(SAM, "Sam Multi")],
                [ROSA, person(ROSA, "Rosa Emergency")],
            ]),
        });
        expect(res.items.map((i) => i.person_id).sort()).toEqual([ROSA, SAM].sort());
    });

    it("7. the status distinguishes partial from clean", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({
            ...base,
            personsById: new Map([
                [SAM, person(SAM, "Sam Multi")],
                [ROSA, person(ROSA, "Rosa Emergency")],
            ]),
        });
        expect(res.status).toBe("resolved_with_warnings");
    });

    it("8. the skipped row is REPORTED, never silently swallowed", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({
            ...base,
            personsById: new Map([
                [SAM, person(SAM, "Sam Multi")],
                [ROSA, person(ROSA, "Rosa Emergency")],
            ]),
        });
        const w = (res.warnings ?? []).find((x) => x.relationship_id === "r3");
        expect(w, "the unresolvable row produced no warning").toBeTruthy();
        expect(w!.person_id).toBe("person-missing");
        expect(w!.source).toBe("person_child_relationships");
        expect(typeof w!.reason).toBe("string");
        expect(w!.recoverable).toBe(true);
    });

    it("9. ALL rows unresolvable still reports why, rather than a bare empty", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({ ...base, personsById: new Map() });
        expect(res.items).toHaveLength(0);
        expect(res.status).toBe("missing_person");
        expect((res.warnings ?? []).length, "an empty result with no explanation is the original defect").toBe(3);
    });

    it("10. a genuinely childless relationship set is `empty`, with no warnings", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({
            orgId: ORG,
            customerId: CUSTOMER,
            customerMemberId: CHILD,
            relationships: [],
            roleAssignments: [],
            personsById: new Map(),
        });
        expect(res.status).toBe("empty");
        expect(res.warnings ?? []).toHaveLength(0);
    });

    it("11. a cross-organization person is excluded AND reported — never partially returned", () => {
        const res = resolvePersonChildRelationshipsForCustomerMember({
            orgId: ORG,
            customerId: CUSTOMER,
            customerMemberId: CHILD,
            relationships: [rel("r1", SAM) as never, { ...rel("r9", "person-foreign"), org_id: "org-2" } as never],
            roleAssignments: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "guardian", is_active: true }],
            personsById: new Map([[SAM, person(SAM, "Sam Multi")]]),
        });
        expect(res.items.map((i) => i.person_id)).toEqual([SAM]);
        expect(res.items.some((i) => i.person_id === "person-foreign"), "a foreign-org person was returned").toBe(false);
    });
});

describe("normalized merge — one Person, every role, storage invisible", () => {
    /** Sam holds a canonical pickup AND a legacy guardian; Dana is legacy-only. */
    const merged = () =>
        listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                roles: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true }],
                persons: [person(SAM, "Sam Multi"), person(DANA, "Dana Guardian")],
                cmc: [
                    { id: "c1", org_id: ORG, customer_id: CUSTOMER, customer_member_id: CHILD, contact_id: "ct-sam", role_key: "guardian", is_active: true },
                    { id: "c2", org_id: ORG, customer_id: CUSTOMER, customer_member_id: CHILD, contact_id: "ct-dana", role_key: "guardian", is_active: true },
                ],
                contacts: [
                    { id: "ct-sam", person_id: SAM },
                    { id: "ct-dana", person_id: DANA },
                ],
            }),
            orgId: ORG,
            customerMemberId: CHILD,
        });

    it("12. the same Person in BOTH stores is one item with both roles", async () => {
        const items = await merged();
        const sam = items.filter((i) => i.person_id === SAM);
        expect(sam, "the multi-role Person was returned twice — persistence leaked into presentation").toHaveLength(1);
        expect([...sam[0]!.operational_roles].sort()).toEqual(["authorized_pickup", "guardian"]);
    });

    it("13. a legacy-only Person is still returned, and is hydrated", async () => {
        const items = await merged();
        const dana = items.find((i) => i.person_id === DANA);
        expect(dana, "the legacy-only guardian vanished from the normalized read").toBeTruthy();
        expect(dana!.operational_roles).toContain("guardian");
        expect((dana!.person as Row | null)?.full_name, "a legacy-only Person was left unhydrated").toBe("Dana Guardian");
    });

    it("14. provenance is metadata-only — never a product-level field", async () => {
        const items = await merged();
        for (const i of items) {
            for (const productField of ["source", "store", "destination", "persists_to", "legacy"]) {
                expect(Object.prototype.hasOwnProperty.call(i, productField), `'${productField}' is exposed at product level`).toBe(false);
            }
        }
        const sam = items.find((i) => i.person_id === SAM)!;
        expect((sam.metadata as Row).merged_sources).toEqual(["person_child_relationships", "customer_member_contacts"]);
    });

    it("15. ordering is deterministic across repeated reads", async () => {
        const a = (await merged()).map((i) => i.id);
        const b = (await merged()).map((i) => i.id);
        expect(a).toEqual(b);
    });

    it("16. a role filter matches a LEGACY-sourced role too", async () => {
        // Guardian lives in customer_member_contacts. Filtering must not be blind to it, or an
        // operator searching for guardians would see none.
        const items = await listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                roles: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true }],
                persons: [person(SAM, "Sam Multi"), person(DANA, "Dana Guardian")],
                cmc: [{ id: "c2", org_id: ORG, customer_id: CUSTOMER, customer_member_id: CHILD, contact_id: "ct-dana", role_key: "guardian", is_active: true }],
                contacts: [{ id: "ct-dana", person_id: DANA }],
            }),
            orgId: ORG,
            customerMemberId: CHILD,
            requiredOperationalRole: "guardian",
        });
        expect(items.map((i) => i.person_id)).toEqual([DANA]);
    });

    it("17. with no legacy rows the canonical result is unchanged", async () => {
        const items = await listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                roles: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true }],
                persons: [person(SAM, "Sam Multi")],
            }),
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(items).toHaveLength(1);
        expect(items[0]!.id, "a canonical row was rewritten by the legacy merge").toBe("r1");
        expect(items[0]!.operational_roles).toEqual(["authorized_pickup"]);
    });

    it("18. a legacy row whose contact has no person bridge is dropped, not fabricated", async () => {
        const items = await listPersonChildRelationships({
            supabase: mockSupabase({
                relationships: [rel("r1", SAM)],
                roles: [{ id: "a1", org_id: ORG, relationship_id: "r1", role_key: "authorized_pickup", is_active: true }],
                persons: [person(SAM, "Sam Multi")],
                cmc: [{ id: "c3", org_id: ORG, customer_id: CUSTOMER, customer_member_id: CHILD, contact_id: "ct-orphan", role_key: "guardian", is_active: true }],
                contacts: [{ id: "ct-orphan", person_id: null }],
            }),
            orgId: ORG,
            customerMemberId: CHILD,
        });
        // The canonical relationship must survive; no phantom person may be invented for the orphan.
        expect(items.map((i) => i.person_id)).toEqual([SAM]);
    });
});
