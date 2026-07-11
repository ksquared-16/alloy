import { describe, expect, it } from "vitest";
import { buildCollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import { evaluateFormFieldAvailabilityForIteration } from "@/lib/fields/collection/evaluateProviderAvailabilityForIteration";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { validateFormSchema } from "@/lib/forms/schema";

const binding = {
    collection_provider_ref: "children",
    iteration_entity_type: "customer_member",
} as const;

const iterationContext = buildCollectionIterationContext({
    collectionProviderRef: "children",
    itemEntityType: "customer_member",
});

const programField = {
    id: "program",
    type: "text" as const,
    label: "Program",
    required: false,
    field_source: { entity_type: "enrollment", field_key: "program_category_id" },
};

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
            collection_binding: binding,
            fields: [programField],
        },
    ],
});

describe("collection availability round-trip", () => {
    it("picker unavailable → publish blocked → submission path uses same semantics", () => {
        const availability = evaluateFormFieldAvailabilityForIteration(programField, iterationContext);
        expect(availability.available).toBe(false);
        expect(availability.reason).toBe("missing_required_context");

        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.field_id === "program")).toBe(true);
    });
});
