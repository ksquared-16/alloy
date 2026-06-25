import { describe, it, expect } from "vitest";
import { resolveFieldKeyForFormField, buildFieldKeyProposedValues } from "@/lib/pos/fieldKeyBinding";
import type { FormField } from "@/lib/forms/schema";

function textField(id: string, source?: { entity_type: string; field_key: string }): FormField {
    return {
        id,
        label: id,
        required: false,
        type: "text",
        ...(source ? { field_source: source } : {}),
    };
}

describe("resolveFieldKeyForFormField", () => {
    it("resolves the registry key from field_source", () => {
        expect(
            resolveFieldKeyForFormField(textField("a", { entity_type: "child", field_key: "child_first_name" }))
        ).toEqual({ entity_type: "child", field_key: "child_first_name" });
    });
    it("returns null for an unbound field", () => {
        expect(resolveFieldKeyForFormField(textField("a"))).toBeNull();
    });
});

describe("buildFieldKeyProposedValues", () => {
    it("keys proposed values by field_key, with form_field_id kept only as provenance", () => {
        const schema = {
            fields: [textField("form_a", { entity_type: "child", field_key: "child_first_name" })],
        };
        expect(buildFieldKeyProposedValues(schema, { form_a: "Emma" })).toEqual([
            { entity_type: "child", field_key: "child_first_name", form_field_id: "form_a", value: "Emma" },
        ]);
    });

    it("maps two different form-field ids bound to the same field_key onto that one field_key", () => {
        const schema = {
            fields: [
                textField("a", { entity_type: "child", field_key: "child_first_name" }),
                textField("b", { entity_type: "child", field_key: "child_first_name" }),
            ],
        };
        const out = buildFieldKeyProposedValues(schema, { a: "X", b: "Y" });
        expect(out.map((o) => o.field_key)).toEqual(["child_first_name", "child_first_name"]);
        expect(out.map((o) => o.form_field_id)).toEqual(["a", "b"]);
    });

    it("skips unbound fields and fields absent from the payload", () => {
        const schema = {
            fields: [
                textField("bound", { entity_type: "child", field_key: "child_first_name" }),
                textField("unbound"),
            ],
        };
        expect(buildFieldKeyProposedValues(schema, {})).toEqual([]);
        expect(buildFieldKeyProposedValues(schema, { bound: "v", unbound: "ignored" })).toEqual([
            { entity_type: "child", field_key: "child_first_name", form_field_id: "bound", value: "v" },
        ]);
    });
});
