import { describe, expect, it } from "vitest";
import {
    formsDocumentsReferencesForFieldKey,
    indexFormsDocumentsSchemaReferences,
} from "@/lib/forms/collection/formsDocumentsReferenceIndex";
import { validateFormSchema } from "@/lib/forms/schema";

describe("Forms/Documents reference index", () => {
    it("indexes nested field and collection provider references for delete-safety queries", () => {
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

        const indexed = indexFormsDocumentsSchemaReferences({
            form_id: "form-1",
            form_name: "Enrollment",
            published: true,
            schema,
        });

        expect(indexed.references.some((r) => r.kind === "collection_provider")).toBe(true);
        expect(indexed.references.some((r) => r.kind === "nested_field")).toBe(true);

        const fieldHits = formsDocumentsReferencesForFieldKey([indexed], "child", "child_first_name");
        expect(fieldHits).toHaveLength(1);
    });
});
