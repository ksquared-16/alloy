import { describe, expect, it } from "vitest";
import {
    discoverFormsDocumentsSchemaReferences,
    schemaReferencesCollectionProvider,
} from "@/lib/forms/collection/formsDocumentsSchemaReferences";
import { validateFormSchema } from "@/lib/forms/schema";

describe("Forms/Documents schema reference discovery", () => {
    it("discovers collection provider and nested fields", () => {
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
        expect(refs.some((r) => r.kind === "nested_field" && r.group_id === "kids")).toBe(true);
        expect(schemaReferencesCollectionProvider(schema, "children")).toBe(true);
        expect(schemaReferencesCollectionProvider(schema, "household.members")).toBe(false);
    });
});
