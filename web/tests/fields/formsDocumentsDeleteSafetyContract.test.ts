import { describe, expect, it } from "vitest";
import {
    discoverFormsDocumentsSchemaReferences,
    formsDocumentsReferencesCollectionProvider,
} from "@/lib/forms/collection/formsDocumentsSchemaReferences";
import { validateFormSchema } from "@/lib/forms/schema";

/**
 * Delete-safety contract — Forms / Documents are known reference consumers of field_definitions.
 * P4 adds bounded schema reference discovery for collection providers and nested fields.
 *
 * @see docs/sprints/08_2026/forms-documents-collection-authoring.md
 */
describe("formsDocuments delete-safety contract", () => {
    it("discovers collection provider refs for delete-safety remediation", () => {
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

        const refs = discoverFormsDocumentsSchemaReferences(schema);
        expect(refs.some((r) => r.kind === "collection_provider" && r.ref === "children")).toBe(true);
        expect(refs.some((r) => r.kind === "nested_field" && r.field_id === "child_first_name")).toBe(true);
    });

    it("surfaces published form references that block unsafe collection provider disable", () => {
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

        const hits = formsDocumentsReferencesCollectionProvider(
            [{ form_id: "form-1", schema, published: true }],
            "children",
        );
        expect(hits).toEqual([{ form_id: "form-1", group_id: "kids", published: true }]);
    });
});
