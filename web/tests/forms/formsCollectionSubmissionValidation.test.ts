import { describe, expect, it, vi } from "vitest";
import {
    extractCollectionSubmissionEnvelope,
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
            required: true,
            repeat: { min: 1, max: 5 },
            collection_binding: {
                collection_provider_ref: "children",
                iteration_entity_type: "customer_member",
            },
            fields: [
                {
                    id: "child_first_name",
                    type: "text",
                    label: "First",
                    required: true,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
            ],
        },
    ],
});

describe("collection submission contract validation", () => {
    it("rejects tampered provider_ref", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            values: { child_first_name: "Sam" },
                            collection: {
                                provider_ref: "wrong",
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

    it("rejects existing origin without item_id on submit", () => {
        const errors = validateCollectionPayloadContract(
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

    it("rejects duplicate item_id in same group", () => {
        const errors = validateCollectionPayloadContract(
            schema,
            {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "a",
                            values: {},
                            collection: {
                                provider_ref: "children",
                                item_id: "cm-1",
                                origin: "existing",
                                iteration_entity_type: "customer_member",
                            },
                        },
                        {
                            instance_key: "b",
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
            "draft",
        );
        expect(errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
    });

    it("extracts Processing envelope from payload", () => {
        const envelope = extractCollectionSubmissionEnvelope({
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        });
        expect(envelope.kids).toBeDefined();
        expect((envelope.kids as unknown[])[0]).toMatchObject({ origin: "existing", item_id: "cm-1" });
    });

    it("rejects cross-household child item_id on org security check", async () => {
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

    it("rejects cross-org person item_id on org security check", async () => {
        const supabase = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const parentsSchema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["parents"] }],
            fields: [
                {
                    id: "parents",
                    type: "group",
                    label: "Parents",
                    required: false,
                    repeat: { min: 0, max: 5 },
                    collection_binding: {
                        collection_provider_ref: "person.contact_role.parents",
                        iteration_entity_type: "person",
                    },
                    fields: [
                        {
                            id: "parent_email",
                            type: "text",
                            label: "Email",
                            required: false,
                            field_source: { entity_type: "guardian", field_key: "guardian_email" },
                        },
                    ],
                },
            ],
        });

        const errors = await validateCollectionPayloadOrgSecurity(
            supabase,
            "org-1",
            parentsSchema,
            {
                values: {},
                groups: {
                    parents: [
                        {
                            instance_key: "col:person.contact_role.parents:p-1",
                            values: {},
                            collection: {
                                provider_ref: "person.contact_role.parents",
                                item_id: "p-1",
                                origin: "existing",
                                iteration_entity_type: "person",
                            },
                        },
                    ],
                },
            },
            { customer_id: "cust-1" },
        );
        expect(errors.some((e) => e.message.includes("organization"))).toBe(true);
    });
});
