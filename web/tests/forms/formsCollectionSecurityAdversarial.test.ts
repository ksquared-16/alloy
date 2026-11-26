import { describe, expect, it, vi } from "vitest";
import {
    validateCollectionPayloadContract,
    validateCollectionPayloadOrgSecurity,
} from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { validateFormSchema } from "@/lib/forms/schema";

const schema = validateFormSchema({
    schema_version: 1,
    title: "T",
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

describe("collection submission adversarial security", () => {
    it("rejects provider substitution", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "x",
                            values: {},
                            collection: {
                                provider_ref: "household.members",
                                item_id: "cm-1",
                                origin: "existing",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
            "submit",
        );
        expect(errors.some((e) => e.path.includes("provider_ref"))).toBe(true);
    });

    it("rejects iteration entity substitution", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "x",
                            values: {},
                            collection: {
                                provider_ref: "children",
                                item_id: "cm-1",
                                origin: "existing",
                                iteration_entity_type: "person",
                            },
                        },
                    ],
                },
            },
            "submit",
        );
        expect(errors.some((e) => e.path.includes("iteration_entity_type"))).toBe(true);
    });

    it("rejects existing origin without item_id", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "x",
                            values: {},
                            collection: {
                                provider_ref: "children",
                                origin: "existing",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
            "submit",
        );
        expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects respondent_added with item_id on submit", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "new-1",
                            values: {},
                            collection: {
                                provider_ref: "children",
                                item_id: "cm-1",
                                origin: "respondent_added",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
            "submit",
        );
        expect(errors.some((e) => e.path.includes("item_id"))).toBe(true);
    });

    it("rejects cross-household child via org security", async () => {
        const supabase = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "cm-1", customer_id: "other-household" },
                    error: null,
                }),
            }),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const errors = await validateCollectionPayloadOrgSecurity(
            supabase,
            "org-1",
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            values: {},
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
            { customer_id: "cust-1" },
        );
        expect(errors.some((e) => e.message.includes("household"))).toBe(true);
    });
});
