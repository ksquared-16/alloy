import { describe, expect, it, vi } from "vitest";
import {
    createPersonChildRelationship,
    addPersonChildRelationshipRole,
    updatePersonChildRelationship,
} from "@/lib/fields/personChildRelationship/personChildRelationshipService";

function mockSupabase(state: {
    relationships: Record<string, unknown>[];
    roles: Record<string, unknown>[];
    persons: Record<string, unknown>[];
    optionItems: { item_key: string; label: string }[];
    fieldValues?: Record<string, unknown>[];
}) {
    const relTable = [...state.relationships];
    const roleTable = [...state.roles];
    return {
        from(table: string) {
            const ctx = { table, filters: [] as [string, unknown][] };
            const api = {
                select: () => api,
                eq: (col: string, val: unknown) => { ctx.filters.push([col, val]); return api; },
                in: () => api,
                order: () => api,
                limit: () => api,
                maybeSingle: async () => {
                    if (table === "person_child_relationships") {
                        const f = Object.fromEntries(ctx.filters as [string, unknown][]);
                        const row = relTable.find((r) =>
                            (!f.org_id || r.org_id === f.org_id) && (!f.id || r.id === f.id)
                            && (!f.customer_member_id || r.customer_member_id === f.customer_member_id)
                            && (!f.person_id || r.person_id === f.person_id),
                        );
                        return { data: row ?? null, error: null };
                    }
                    if (table === "option_sets") return { data: { id: "os-1" }, error: null };
                    return { data: null, error: null };
                },
                single: async () => ({ data: relTable[relTable.length - 1], error: null }),
                insert: (row: Record<string, unknown>) => {
                    if (table === "person_child_relationships") relTable.push({ ...row, id: row.id ?? `rel-${relTable.length + 1}` });
                    if (table === "person_child_relationship_roles") roleTable.push(row);
                    return { select: () => ({ single: async () => ({ data: relTable[relTable.length - 1], error: null }) }) };
                },
                upsert: async () => ({ error: null }),
                update: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
            };
            if (table === "option_sets") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                limit: async () => ({ data: [{ id: "os-1" }], error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "option_set_items") {
                return { select: () => ({ eq: () => ({ order: async () => ({ data: state.optionItems, error: null }) }) }) };
            }
            if (table === "persons") {
                return { select: () => ({ eq: () => ({ in: async () => ({ data: state.persons, error: null }) }) }) };
            }
            if (table === "person_child_relationship_roles") {
                return {
                    select: () => ({ eq: () => ({ in: async () => ({ data: roleTable, error: null }) }) }),
                    insert: (row: Record<string, unknown>) => { roleTable.push(row); return { error: null }; },
                    upsert: async () => ({ error: null }),
                    update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
                };
            }
            if (table === "field_definitions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    in: async () => ({
                                        data: [{ id: "fd-pickup", field_key: "pickup_instructions", field_type: "text" }],
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "field_values") {
                const fvApi = {
                    eq: () => fvApi,
                    in: async () => ({ data: state.fieldValues ?? [], error: null }),
                    maybeSingle: async () => ({ data: null, error: null }),
                };
                return {
                    select: () => fvApi,
                    insert: async () => ({ error: null }),
                    update: () => ({ eq: async () => ({ error: null }) }),
                };
            }
            return api;
        },
    } as never;
}

describe("personChildRelationshipService", () => {
    it("creates Alex ↔ Mia with emergency_contact role and aunt kinship", async () => {
        const supabase = mockSupabase({
            relationships: [],
            roles: [],
            persons: [{ id: "alex", display_name: "Alex", org_id: "org-1" }],
            optionItems: [{ item_key: "aunt", label: "Aunt" }],
        });
        const result = await createPersonChildRelationship(supabase, {
            orgId: "org-1",
            customerId: "cust-1",
            customerMemberId: "mia",
            personId: "alex",
            relationshipType: "aunt",
            operationalRoles: ["emergency_contact"],
            customFields: { pickup_instructions: "Call after 5 PM" },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.relationship.person_id).toBe("alex");
            expect(result.relationship.relationship_type).toBe("aunt");
            expect(result.relationship.operational_roles).toContain("emergency_contact");
        }
    });

    it("rejects duplicate Person ↔ Child edge", async () => {
        const supabase = mockSupabase({
            relationships: [{ id: "r1", org_id: "org-1", customer_member_id: "mia", person_id: "alex" }],
            roles: [],
            persons: [{ id: "alex", display_name: "Alex" }],
            optionItems: [{ item_key: "aunt", label: "Aunt" }],
        });
        const result = await createPersonChildRelationship(supabase, {
            orgId: "org-1",
            customerId: "cust-1",
            customerMemberId: "mia",
            personId: "alex",
        });
        expect(result.ok).toBe(false);
    });

    it("rejects invalid relationship_type option", async () => {
        const supabase = mockSupabase({
            relationships: [],
            roles: [],
            persons: [{ id: "alex", display_name: "Alex" }],
            optionItems: [{ item_key: "aunt", label: "Aunt" }],
        });
        const result = await createPersonChildRelationship(supabase, {
            orgId: "org-1",
            customerId: "cust-1",
            customerMemberId: "mia",
            personId: "alex",
            relationshipType: "cousin",
        });
        expect(result.ok).toBe(false);
    });
});
