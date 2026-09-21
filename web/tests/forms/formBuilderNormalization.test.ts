import { describe, expect, it } from "vitest";

import { addField, createBlankSchema, updateField } from "@/lib/forms/formBuilderSchema";
import { validateFormSchema } from "@/lib/forms/schema";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";

/**
 * THE IMPORTED DOCUMENT IS EVIDENCE, NOT THE INTERACTION MODEL.
 *
 * Four capabilities have existed in `FormSchemaV1` since v1 and had no authoring path, so the only
 * way to normalize an imported packet was to publish a schema through the API — which is what this
 * lane has been doing by hand. Each one below is proven to survive authoring AND to be the shape the
 * runtime already consumes, because a builder that writes something the runtime does not read is
 * worse than no builder.
 */

const blank = () => createBlankSchema("Admissions Information");

describe("an organization vocabulary can be chosen instead of a private list", () => {
    it("binds a question to person_gender rather than copying the choices", () => {
        const { schema, fieldId } = addField(blank(), {
            type: "select",
            label: "How would you describe your child's gender?",
            option_set_key: "person_gender",
        });
        const f = schema.fields.find((x) => x.id === fieldId) as { option_set_key?: string; static_options?: unknown };
        expect(f.option_set_key).toBe("person_gender");
        expect(f.static_options).toBeUndefined();
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("never lets a field hold both a vocabulary and its own copy", () => {
        const { schema, fieldId } = addField(blank(), {
            type: "select",
            label: "Gender",
            options: [{ value: "f", label: "Female" }],
        });
        const withKey = updateField(schema, fieldId, { option_set_key: "person_gender" });
        const a = withKey.fields[0] as { option_set_key?: string; static_options?: unknown };
        expect(a.option_set_key).toBe("person_gender");
        expect(a.static_options).toBeUndefined();

        // and back again — choosing an inline list is choosing not to use the vocabulary
        const backToInline = updateField(withKey, fieldId, { options: [{ value: "f", label: "Female" }] });
        const b = backToInline.fields[0] as { option_set_key?: string; static_options?: unknown[] };
        expect(b.option_set_key).toBeUndefined();
        expect(b.static_options).toHaveLength(1);
    });
});

describe("a question can be asked only when another answer matches", () => {
    it("authors the schema's own condition, which the platform evaluator then honours", () => {
        let schema = blank();
        const gate = addField(schema, { type: "boolean", label: "Does your child have siblings?" });
        schema = gate.schema;
        const detail = addField(schema, {
            type: "long_text",
            label: "Please list sibling names and ages",
            visible_when: { field_id: gate.fieldId, equals: true },
        });
        schema = detail.schema;

        const parsed = validateFormSchema(schema);
        // The runtime's own evaluator, not a second engine.
        expect(evaluateFieldVisibility(detail.fieldId, parsed, () => true)).toBe(true);
        expect(evaluateFieldVisibility(detail.fieldId, parsed, () => false)).toBe(false);
        expect(evaluateFieldVisibility(detail.fieldId, parsed, () => undefined)).toBe(false);
    });

    it("clearing the condition asks the question always — presence is the signal", () => {
        let schema = blank();
        const gate = addField(schema, { type: "boolean", label: "Does your child have siblings?" });
        schema = gate.schema;
        const detail = addField(schema, { type: "long_text", label: "List them", visible_when: { field_id: gate.fieldId, equals: true } });
        schema = detail.schema;
        expect((schema.fields[1] as { visibility?: unknown }).visibility).toBeDefined();

        const always = updateField(schema, detail.fieldId, { visible_when: null });
        expect((always.fields[1] as { visibility?: unknown }).visibility).toBeUndefined();

        // An absent key still means "leave it alone" — the trap `field_source` already fell into.
        const untouched = updateField(schema, detail.fieldId, { label: "List them please" });
        expect((untouched.fields[1] as { visibility?: unknown }).visibility).toBeDefined();
    });
});

describe("a value Alloy can calculate is never asked for", () => {
    it("authors age from date of birth against a start date", () => {
        let schema = blank();
        const dob = addField(schema, { type: "date", label: "Student Date of Birth" });
        schema = dob.schema;
        const start = addField(schema, { type: "date", label: "Student's first day" });
        schema = start.schema;
        const age = addField(schema, {
            type: "short_text",
            label: "Student Age Upon Enrolling",
            derived: { kind: "age_from_date_of_birth", source_key: dob.fieldId, as_of_key: start.fieldId },
        });
        schema = age.schema;

        const f = schema.fields.find((x) => x.id === age.fieldId) as { derived?: { kind: string; source_key?: string; as_of_key?: string } };
        expect(f.derived).toEqual({ kind: "age_from_date_of_birth", source_key: dob.fieldId, as_of_key: start.fieldId });
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("stops being derived when the administrator says so", () => {
        const { schema, fieldId } = addField(blank(), {
            type: "short_text",
            label: "Age",
            derived: { kind: "execution_date" },
        });
        expect((schema.fields[0] as { derived?: unknown }).derived).toBeDefined();
        expect((updateField(schema, fieldId, { derived: null }).fields[0] as { derived?: unknown }).derived).toBeUndefined();
    });
});

describe("the capabilities survive a round trip through the canonical validator", () => {
    it("a schema carrying all four still parses", () => {
        let schema = blank();
        const dob = addField(schema, { type: "date", label: "Date of birth" });
        schema = dob.schema;
        const gate = addField(schema, { type: "boolean", label: "Any siblings?" });
        schema = gate.schema;
        schema = addField(schema, { type: "long_text", label: "List them", visible_when: { field_id: gate.fieldId, equals: true } }).schema;
        schema = addField(schema, { type: "select", label: "Gender", option_set_key: "person_gender" }).schema;
        schema = addField(schema, { type: "multiselect", label: "Days attending", options: [{ value: "mon", label: "Monday" }] }).schema;
        schema = addField(schema, { type: "short_text", label: "Age", derived: { kind: "age_from_date_of_birth", source_key: dob.fieldId } }).schema;
        schema = addField(schema, {
            type: "short_text", label: "Parent/Guardian #1 Phone",
            field_source: { entity_type: "guardian", field_key: "guardian_phone", shared_value_key: "guardian_phone" },
        }).schema;

        const parsed = validateFormSchema(schema);
        expect(parsed.fields).toHaveLength(7);
        expect(parsed.fields.filter((f) => (f as { visibility?: unknown }).visibility)).toHaveLength(1);
        expect(parsed.fields.filter((f) => (f as { derived?: unknown }).derived)).toHaveLength(1);
        expect(parsed.fields.filter((f) => (f as { option_set_key?: string }).option_set_key)).toHaveLength(1);
        expect(parsed.fields.filter((f) => f.field_source)).toHaveLength(1);
    });
});
