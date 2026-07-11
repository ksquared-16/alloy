import { describe, expect, it } from "vitest";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { fieldIsInsideCollectionBoundGroup } from "@/lib/forms/prefill/formsCollectionPrefill";
import { validateFormSchema } from "@/lib/forms/schema";

const packetStepSchema = validateFormSchema({
    schema_version: 1,
    title: "Packet step",
    sections: [{ id: "s", field_ids: ["kids", "household_note"] }],
    fields: [
        {
            id: "household_note",
            type: "text",
            label: "Note",
            required: false,
            field_source: { entity_type: "customer", field_key: "notes" },
        },
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

describe("collection packet integration", () => {
    it("keeps collection nested fields step-local — not in scalar shared_values dedupe", () => {
        expect(
            fieldIsInsideCollectionBoundGroup(packetStepSchema, "child_first_name"),
        ).toBe(true);
        expect(fieldIsInsideCollectionBoundGroup(packetStepSchema, "household_note")).toBe(false);
    });

    it("preserves stable instance keys on resume merge", () => {
        const resumed = mergeFormPrefillPayload({
            schema: packetStepSchema,
            scalarPrefill: { household_note: "packet-shared" },
            collectionPrefill: {
                kids: [
                    {
                        instance_key: "col:children:cm-2",
                        values: { child_first_name: "Fresh" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-2",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
            saved: {
                values: { household_note: "packet-shared" },
                groups: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            values: { child_first_name: "Saved" },
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

        const keys = (resumed.groups?.kids ?? []).map((r) => r.instance_key).sort();
        expect(keys).toEqual(["col:children:cm-1", "col:children:cm-2"]);
    });

    it("scalar shared values do not overwrite saved collection row values", () => {
        const merged = mergeFormPrefillPayload({
            schema: packetStepSchema,
            collectionPrefill: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Canonical" },
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
                            instance_key: "col:children:cm-1",
                            values: { child_first_name: "Step-local edit" },
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
        expect(merged.groups?.kids?.[0]?.values.child_first_name).toBe("Step-local edit");
    });
});
