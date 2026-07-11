import { describe, expect, it } from "vitest";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { extractCollectionSubmissionEnvelope } from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { validateFormSchema } from "@/lib/forms/schema";

const packetSchema = validateFormSchema({
    schema_version: 1,
    title: "Packet step",
    sections: [{ id: "s", field_ids: ["kids", "note"] }],
    fields: [
        {
            id: "note",
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

describe("packet end-to-end collection behavior", () => {
    it("resume preserves stable keys and envelope for packet step", () => {
        const resumed = mergeFormPrefillPayload({
            schema: packetSchema,
            scalarPrefill: { note: "shared" },
            saved: {
                values: { note: "shared" },
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

        const envelope = extractCollectionSubmissionEnvelope(resumed);
        expect(envelope.kids).toBeDefined();
        expect((envelope.kids as Array<{ instance_key: string }>)[0]?.instance_key).toBe("col:children:cm-1");
    });

    it("parents repeater rows remain distinct by person item_id", () => {
        const parentsSchema = validateFormSchema({
            schema_version: 1,
            title: "P",
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

        const payload = mergeFormPrefillPayload({
            schema: parentsSchema,
            collectionPrefill: {
                parents: [
                    {
                        instance_key: "col:person.contact_role.parents:p-1",
                        values: { parent_email: "a@b.com" },
                        collection: {
                            provider_ref: "person.contact_role.parents",
                            item_id: "p-1",
                            origin: "existing",
                            iteration_entity_type: "person",
                        },
                    },
                    {
                        instance_key: "col:person.contact_role.parents:p-2",
                        values: { parent_email: "c@d.com" },
                        collection: {
                            provider_ref: "person.contact_role.parents",
                            item_id: "p-2",
                            origin: "existing",
                            iteration_entity_type: "person",
                        },
                    },
                ],
            },
        });

        expect(payload.groups?.parents).toHaveLength(2);
        const ids = payload.groups?.parents?.map((r) => r.collection?.item_id).sort();
        expect(ids).toEqual(["p-1", "p-2"]);
    });
});
