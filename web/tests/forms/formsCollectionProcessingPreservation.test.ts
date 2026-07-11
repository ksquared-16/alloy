import { describe, expect, it } from "vitest";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import { extractCollectionSubmissionEnvelope } from "@/lib/forms/collection/formsCollectionSubmissionValidation";

const schema = validateFormSchema({
    schema_version: 1,
    title: "T",
    sections: [{ id: "s", field_ids: ["kids", "parents"] }],
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

describe("Processing envelope preservation", () => {
    it("validateFormPayload preserves collection metadata on group rows", () => {
        const payload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing" as const,
                            iteration_entity_type: "customer_member",
                        },
                    },
                    {
                        instance_key: "client-new-1",
                        values: { child_first_name: "New" },
                        collection: {
                            provider_ref: "children",
                            origin: "respondent_added" as const,
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };

        const result = validateFormPayload({ schemaJson: schema, payload, mode: "draft" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const kids = result.payload.groups?.kids ?? [];
        expect(kids[0]?.collection?.origin).toBe("existing");
        expect(kids[0]?.collection?.item_id).toBe("cm-1");
        expect(kids[1]?.collection?.origin).toBe("respondent_added");
        expect(kids[1]?.collection?.item_id).toBeUndefined();
    });

    it("extractCollectionSubmissionEnvelope distinguishes existing vs respondent-added", () => {
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
                    {
                        instance_key: "new-1",
                        values: { child_first_name: "Alex" },
                        collection: {
                            provider_ref: "children",
                            origin: "respondent_added",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        });

        const rows = envelope.kids as Array<{ origin: string; item_id: string | null }>;
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.origin === "existing")?.item_id).toBe("cm-1");
        expect(rows.find((r) => r.origin === "respondent_added")?.item_id).toBeNull();
    });

    it("envelope preserves nested field values for P5 Processing bridge", () => {
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
        const row = (envelope.kids as Array<{ values: Record<string, unknown> }>)[0]!;
        expect(row.values.child_first_name).toBe("Sam");
    });
});
