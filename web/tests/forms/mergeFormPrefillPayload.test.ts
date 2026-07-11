import { describe, expect, it } from "vitest";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { validateFormSchema } from "@/lib/forms/schema";

const childrenGroupSchema = validateFormSchema({
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

describe("mergeFormPrefillPayload precedence", () => {
    it("saved respondent values win over canonical scalar prefill", () => {
        const result = mergeFormPrefillPayload({
            schema: childrenGroupSchema,
            scalarPrefill: { top: "canonical" },
            saved: { values: { top: "respondent" } },
        });
        expect(result.values.top).toBe("respondent");
    });

    it("matches collection rows by item_id — no duplicate prefill", () => {
        const canonical = {
            kids: [
                {
                    instance_key: "col:children:cm-1",
                    values: { child_first_name: "Canonical" },
                    collection: {
                        provider_ref: "children",
                        item_id: "cm-1",
                        origin: "existing" as const,
                        iteration_entity_type: "customer_member",
                    },
                },
            ],
        };
        const saved = {
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Edited" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing" as const,
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };
        const result = mergeFormPrefillPayload({
            schema: childrenGroupSchema,
            collectionPrefill: canonical,
            saved,
        });
        expect(result.groups?.kids).toHaveLength(1);
        expect(result.groups?.kids?.[0]?.values.child_first_name).toBe("Edited");
    });

    it("preserves respondent-added instances alongside canonical existing", () => {
        const result = mergeFormPrefillPayload({
            schema: childrenGroupSchema,
            collectionPrefill: {
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
            saved: {
                groups: {
                    kids: [
                        {
                            instance_key: "client-new-1",
                            values: { child_first_name: "New" },
                            collection: {
                                provider_ref: "children",
                                origin: "respondent_added",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
        });
        expect(result.groups?.kids?.length).toBe(2);
    });

    it("does not merge by array index", () => {
        const rows = mergeFormPrefillPayload({
            schema: childrenGroupSchema,
            collectionPrefill: {
                kids: [
                    {
                        instance_key: "col:children:a",
                        values: {},
                        collection: {
                            provider_ref: "children",
                            item_id: "a",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        }).groups?.kids;
        expect(rows?.[0]?.instance_key).toBe("col:children:a");
        expect(rows?.[0]?.instance_key).not.toBe("0");
    });
});
