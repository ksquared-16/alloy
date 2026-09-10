import { describe, expect, it } from "vitest";

import { updateField } from "@/lib/forms/formBuilderSchema";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * A QUESTION COULD NOT BE UNBOUND THROUGH THE PRODUCT.
 *
 * Choosing "Form field only" in the question inspector passes `field_source: undefined`, because
 * there is no empty form of a binding. `updateField` guarded every key with `!== undefined`, meaning
 * "the caller did not mention this" — so the one value that means "clear it" was the one value that
 * did nothing. The Health form had three questions all writing to `customer_member.medical_notes`,
 * and an administrator unbinding them watched the change appear to save and silently not happen.
 */

const schema = {
    title: "Health and Medical Authorization",
    schema_version: 1,
    sections: [],
    fields: [
        {
            id: "field_5",
            label: "Child Medications",
            type: "short_text",
            field_source: { entity_type: "customer_member", field_key: "medical_notes" },
        },
        { id: "field_7", label: "Physician Name", type: "short_text" },
    ],
} as unknown as FormSchemaV1;

const fieldById = (s: FormSchemaV1, id: string) =>
    s.fields.find((f) => f.id === id) as { field_source?: unknown; label?: string } | undefined;

describe("clearing a canonical binding", () => {
    it("removes field_source when the patch explicitly passes undefined", () => {
        const next = updateField(schema, "field_5", { field_source: undefined });
        expect(fieldById(next, "field_5")).not.toHaveProperty("field_source");
    });

    it("leaves the binding alone when field_source is not mentioned at all", () => {
        // An absent key must still mean "do not touch this" — that is what every other key relies on.
        const next = updateField(schema, "field_5", { label: "Child Medications (list)" });
        expect(fieldById(next, "field_5")?.field_source).toEqual({
            entity_type: "customer_member",
            field_key: "medical_notes",
        });
        expect(fieldById(next, "field_5")?.label).toBe("Child Medications (list)");
    });

    it("still sets a real binding", () => {
        const next = updateField(schema, "field_7", {
            field_source: { entity_type: "customer_member", field_key: "allergies" },
        });
        expect(fieldById(next, "field_7")?.field_source).toEqual({
            entity_type: "customer_member",
            field_key: "allergies",
        });
    });

    it("clears on an incomplete binding too", () => {
        // A half-built source is not a destination; it was already treated as a clear.
        const next = updateField(schema, "field_5", {
            field_source: { entity_type: "", field_key: "" } as never,
        });
        expect(fieldById(next, "field_5")).not.toHaveProperty("field_source");
    });

    it("does not disturb other fields", () => {
        const next = updateField(schema, "field_5", { field_source: undefined });
        expect(fieldById(next, "field_7")).not.toHaveProperty("field_source");
        expect(next.fields).toHaveLength(2);
    });
});
