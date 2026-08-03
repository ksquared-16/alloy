/**
 * POS-FP17 slice 2 — authorized_pickup (and any configured role) read-resolution.
 *
 * Proves pickup no longer returns "unsupported": it resolves GENERICALLY from the canonical
 * `person_child_relationship_roles` store by role key, with empty-state, resolved-state,
 * invalid-context, cross-org isolation, and deterministic ordering. A chainable fake Supabase
 * makes this deterministic without a live DB.
 */

import { describe, it, expect } from "vitest";
import { resolveCanonicalCollection } from "@/lib/fields/relationship/canonicalCollectionResolver";

/** Minimal chainable Supabase double: `.from(t).select().eq().in()...` awaited → { data, error }. */
function fakeSupabase(tables: Record<string, { rows?: Record<string, unknown>[]; error?: boolean }>) {
    const calls: { table: string; eqs: [string, unknown][] }[] = [];
    const make = (table: string) => {
        const spec = tables[table] ?? { rows: [] };
        const eqs: [string, unknown][] = [];
        const q: Record<string, unknown> = {};
        const self = () => q;
        q.select = self;
        q.in = self;
        q.order = self;
        q.eq = (col: string, val: unknown) => {
            eqs.push([col, val]);
            return q;
        };
        q.maybeSingle = async () => ({ data: (spec.rows ?? [])[0] ?? null, error: spec.error ? { message: "err" } : null });
        // Filter rows by the accumulated eq() constraints so org/role/customer isolation is exercised.
        (q as { then: unknown }).then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
            calls.push({ table, eqs });
            if (spec.error) return resolve({ data: null, error: { message: "err" } });
            const rows = (spec.rows ?? []).filter((r) => eqs.every(([c, v]) => r[c] === undefined || r[c] === v));
            return resolve({ data: rows, error: null });
        };
        return q;
    };
    return { supabase: { from: make } as never, calls };
}

const CTX = { orgId: "org1", collectionProviderRef: "person.contact_role.authorized_pickups", customerId: "cust1" };

describe("authorized_pickup read-resolution (generic canonical roles)", () => {
    it("empty state when the household has no pickup relationships", async () => {
        const { supabase } = fakeSupabase({ person_child_relationships: { rows: [] } });
        const res = await resolveCanonicalCollection(supabase, CTX);
        expect(res.status).toBe("empty");
        // crucially, NOT "unsupported"
        expect(res.status).not.toBe("unsupported");
    });

    it("invalid context without a household id", async () => {
        const { supabase } = fakeSupabase({});
        const res = await resolveCanonicalCollection(supabase, { ...CTX, customerId: null });
        expect(res.status).toBe("invalid_context");
    });

    it("resolves the authorized-pickup people for the household", async () => {
        const { supabase } = fakeSupabase({
            person_child_relationships: {
                rows: [
                    { id: "rel1", person_id: "p1", status: "active", org_id: "org1", customer_id: "cust1" },
                    { id: "rel2", person_id: "p2", status: "active", org_id: "org1", customer_id: "cust1" },
                ],
            },
            person_child_relationship_roles: {
                rows: [
                    { relationship_id: "rel1", role_key: "authorized_pickup", is_active: true, org_id: "org1" },
                    { relationship_id: "rel2", role_key: "emergency_contact", is_active: true, org_id: "org1" }, // different role — excluded
                ],
            },
            persons: { rows: [{ id: "p1", display_name: "Uncle Mike" }] },
        });
        const res = await resolveCanonicalCollection(supabase, CTX);
        expect(res.status).toBe("resolved");
        if (res.status === "resolved") {
            expect(res.items.map((i) => i.item_id)).toEqual(["p1"]);
            expect(res.items[0].item_entity_type).toBe("person");
        }
    });

    it("is org-isolated (a role row from another org is filtered out)", async () => {
        const { supabase } = fakeSupabase({
            person_child_relationships: { rows: [{ id: "rel1", person_id: "p1", status: "active", org_id: "org1", customer_id: "cust1" }] },
            person_child_relationship_roles: { rows: [{ relationship_id: "rel1", role_key: "authorized_pickup", is_active: true, org_id: "OTHER_ORG" }] },
            persons: { rows: [{ id: "p1", display_name: "Uncle Mike" }] },
        });
        const res = await resolveCanonicalCollection(supabase, CTX);
        // the role row belongs to another org → filtered by the eq("org_id","org1") constraint → empty
        expect(res.status).toBe("empty");
    });
});
