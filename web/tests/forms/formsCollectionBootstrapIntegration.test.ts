import { describe, expect, it, vi } from "vitest";
import { resolveFormsCollectionPrefillGroups } from "@/lib/forms/prefill/formsCollectionPrefillResolver";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { validateFormSchema } from "@/lib/forms/schema";

const childrenSchema = validateFormSchema({
    schema_version: 1,
    title: "Children form",
    sections: [{ id: "s", field_ids: ["kids"] }],
    fields: [
        {
            id: "kids",
            type: "group",
            label: "Children",
            required: false,
            repeat: { min: 0, max: 5 },
            collection_binding: {
                collection_provider_ref: "children",
                iteration_entity_type: "customer_member",
            },
            fields: [
                {
                    id: "child_first_name",
                    type: "text",
                    label: "First",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
            ],
        },
    ],
});

function mockSupabaseForChildren(rows: Record<string, unknown>[]) {
    const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
            data: rows[0] ? { id: rows[0]!.id, customer_id: rows[0]!.customer_id } : null,
            error: null,
        }),
    };
    return {
        from: vi.fn().mockReturnValue(chain),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("collection bootstrap integration", () => {
    it("resolves Children prefill when customer_id is present", async () => {
        const supabase = mockSupabaseForChildren([
            {
                id: "cm-1",
                customer_id: "cust-1",
                first_name: "Sam",
                last_name: "Lee",
                display_name: "Sam Lee",
                is_active: true,
                created_at: "2026-01-01",
            },
        ]);

        const result = await resolveFormsCollectionPrefillGroups(supabase, "org-1", childrenSchema, {
            customer_id: "cust-1",
            person_id: null,
            customer_member_id: null,
            opportunity_id: null,
        });

        expect(result.groups.kids).toHaveLength(1);
        expect(result.groups.kids![0]!.instance_key).toBe("col:children:cm-1");
        expect(result.groups.kids![0]!.collection?.origin).toBe("existing");
        expect(result.groups.kids![0]!.values.child_first_name).toBe("Sam");
        expect(result.states.kids).toMatchObject({ kind: "resolved", item_count: 1 });
    });

    it("returns invalid_context without customer_id — no fake records", async () => {
        const supabase = mockSupabaseForChildren([]);

        const result = await resolveFormsCollectionPrefillGroups(supabase, "org-1", childrenSchema, {
            customer_id: null,
            person_id: null,
            customer_member_id: null,
            opportunity_id: null,
        });

        expect(result.groups.kids).toBeUndefined();
        expect(result.states.kids).toMatchObject({ kind: "invalid_context" });
    });

    it("orchestrates scalar + collection merge with saved respondent precedence", async () => {
        const supabase = mockSupabaseForChildren([
            {
                id: "cm-1",
                customer_id: "cust-1",
                first_name: "Canonical",
                is_active: true,
                created_at: "2026-01-01",
            },
        ]);

        const collectionResult = await resolveFormsCollectionPrefillGroups(supabase, "org-1", childrenSchema, {
            customer_id: "cust-1",
            person_id: null,
            customer_member_id: null,
            opportunity_id: null,
        });

        const merged = mergeFormPrefillPayload({
            schema: childrenSchema,
            scalarPrefill: { household_note: "from-record" },
            collectionPrefill: collectionResult.groups,
            saved: {
                values: { household_note: "respondent-edit" },
                groups: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            values: { child_first_name: "Edited" },
                            collection: {
                                provider_ref: "children",
                                item_id: "cm-1",
                                origin: "existing",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
        });

        expect(merged.values.household_note).toBe("respondent-edit");
        expect(merged.groups?.kids?.[0]?.values.child_first_name).toBe("Edited");
    });
});
