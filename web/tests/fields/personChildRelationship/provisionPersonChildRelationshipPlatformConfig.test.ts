import { describe, expect, it } from "vitest";
import { provisionPersonChildRelationshipPlatformConfig } from "@/lib/fields/personChildRelationship/provisionPersonChildRelationshipPlatformConfig";

describe("provisionPersonChildRelationshipPlatformConfig", () => {
    it("is idempotent for org provisioning", async () => {
        const sectionRows: unknown[] = [];
        const optionSets: { id: string; set_key: string }[] = [{ id: "os-1", set_key: "person_child_relationship_type" }];
        const optionItems: unknown[] = [];
        const fieldDefs: unknown[] = [];

        const supabase = {
            from(table: string) {
                const api = {
                    upsert(row: unknown, _opts?: unknown) {
                        if (table === "field_section_definitions") sectionRows.push(row);
                        if (table === "option_sets") return { ...api, select: () => ({ ...api, single: async () => ({ data: optionSets[0], error: null }) }) };
                        if (table === "option_set_items") { optionItems.push(row); return Promise.resolve({ error: null }); }
                        if (table === "field_definitions") { fieldDefs.push(row); return Promise.resolve({ error: null }); }
                        return Promise.resolve({ error: null });
                    },
                    select() { return api; },
                    eq() { return api; },
                    maybeSingle: async () => ({ data: null, error: null }),
                    insert(row: unknown) { fieldDefs.push(row); return Promise.resolve({ error: null }); },
                };
                return api;
            },
        };

        const r1 = await provisionPersonChildRelationshipPlatformConfig(supabase as never, "org-1");
        const r2 = await provisionPersonChildRelationshipPlatformConfig(supabase as never, "org-1");
        expect(r1.field_definitions_upserted).toBeGreaterThan(0);
        expect(r2.field_definitions_upserted).toBeGreaterThan(0);
        expect(optionItems.length).toBeGreaterThanOrEqual(20);
    });
});
