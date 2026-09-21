import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { addField, createBlankSchema, updateField } from "@/lib/forms/formBuilderSchema";
import { validateFormSchema } from "@/lib/forms/schema";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";

/**
 * THE INSPECTOR WRITES WHAT THE RUNTIME READS.
 *
 * The prior slice proved the builder MODEL could express these. That is not the same claim as "an
 * administrator can author them", and collapsing the two is how this document came to say six
 * capabilities were equivalent when two of them only needed a menu entry.
 *
 * These guards cover the half that model factories cannot: that the inspector's controls exist, that
 * they read their displayed value from the field itself rather than from local state that can drift,
 * and that what they write survives the canonical validator and the runtime evaluator.
 */

const INSPECTOR = "app/adminV2/pos/ProcessingFormQuestionInspector.tsx";
const source = () => readFileSync(new URL(`../../${INSPECTOR}`, import.meta.url), "utf8");
/** Comments describe the control; they are not the control. */
const code = () => source().replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the three normalization controls exist in the question inspector", () => {
    for (const [marker, testId] of [
        ["data-inspector-vocabulary", "form-builder-vocabulary"],
        ["data-inspector-condition", "form-builder-condition-source"],
        ["data-inspector-derived", "form-builder-derived-kind"],
    ] as const) {
        it(`renders ${marker}`, () => {
            const src = code();
            expect(src).toContain(marker);
            expect(src).toContain(testId);
        });
    }

    it("reads what it displays from the field, never from a separate copy", () => {
        const src = code();
        // A control showing local state can display one value while the schema holds another —
        // the exact defect this guards, named in the slice brief.
        expect(src).toContain("const vocabularyKey = (field as { option_set_key?: string }).option_set_key");
        expect(src).toContain("const derivedConfig = (field as { derived?:");
        expect(src).toContain(".visibility?.all?.[0] ?? null");
    });

    it("offers the organization's vocabularies, and names none of them itself", () => {
        const src = code();
        expect(src).toContain("optionSets");
        expect(src).not.toContain('"person_gender"');
    });

    it("never offers a question itself as its own condition source", () => {
        expect(code()).toContain("f.id !== field.id");
    });
});

/**
 * GENDER, START DATE, AGE and the SIBLING CONDITIONAL — the four normalization scenarios, each
 * driven through the same `updateField` path the inspector calls, then validated and evaluated.
 */
describe("the four normalization scenarios round-trip", () => {
    const build = () => {
        let schema = createBlankSchema("Normalization fixture");
        const dob = addField(schema, { type: "date", label: "Student Date of Birth" });
        schema = dob.schema;
        const start = addField(schema, { type: "date", label: "Student's first day" });
        schema = start.schema;
        const gender = addField(schema, { type: "select", label: "How would you describe your child's gender?", options: [{ value: "x", label: "X" }] });
        schema = gender.schema;
        const age = addField(schema, { type: "short_text", label: "Student Age Upon Enrolling" });
        schema = age.schema;
        const siblings = addField(schema, { type: "boolean", label: "Does your child have siblings?" });
        schema = siblings.schema;
        const list = addField(schema, { type: "long_text", label: "Please list sibling names and ages" });
        schema = list.schema;
        return { schema, ids: { dob: dob.fieldId, start: start.fieldId, gender: gender.fieldId, age: age.fieldId, siblings: siblings.fieldId, list: list.fieldId } };
    };

    it("GENDER — canonical binding plus the organization vocabulary, inline list gone", () => {
        const { schema, ids } = build();
        let next = updateField(schema, ids.gender, {
            field_source: { entity_type: "customer_member", field_key: "gender" },
        });
        next = updateField(next, ids.gender, { option_set_key: "person_gender" });

        const parsed = validateFormSchema(next);
        const f = parsed.fields.find((x) => x.id === ids.gender) as { field_source?: { field_key: string }; option_set_key?: string; static_options?: unknown };
        expect(f.field_source?.field_key).toBe("gender");
        expect(f.option_set_key).toBe("person_gender");
        expect(f.static_options).toBeUndefined();

        // switching back restores this form's own list and drops the vocabulary
        const back = updateField(next, ids.gender, { options: [{ value: "x", label: "X" }] });
        const g = back.fields.find((x) => x.id === ids.gender) as { option_set_key?: string; static_options?: unknown[] };
        expect(g.option_set_key).toBeUndefined();
        expect(g.static_options).toHaveLength(1);
    });

    it("START DATE — a date question bound to the enrollment's own start date", () => {
        const { schema, ids } = build();
        const next = updateField(schema, ids.start, {
            field_source: { entity_type: "enrollment", field_key: "start_date", shared_value_key: "start_date" },
        });
        const parsed = validateFormSchema(next);
        const f = parsed.fields.find((x) => x.id === ids.start)!;
        expect(f.type).toBe("date");
        expect(f.field_source).toEqual({ entity_type: "enrollment", field_key: "start_date", shared_value_key: "start_date" });
    });

    it("AGE UPON ENROLLING — derived from the two dates, and never asked", () => {
        const { schema, ids } = build();
        const next = updateField(schema, ids.age, {
            derived: { kind: "age_from_date_of_birth", source_key: ids.dob, as_of_key: ids.start },
        });
        const parsed = validateFormSchema(next);
        const f = parsed.fields.find((x) => x.id === ids.age) as { derived?: { kind: string; source_key?: string; as_of_key?: string } };
        expect(f.derived).toEqual({ kind: "age_from_date_of_birth", source_key: ids.dob, as_of_key: ids.start });

        // and it stops being derived when the administrator says so — the old config must not survive
        const asked = updateField(next, ids.age, { derived: null });
        expect((asked.fields.find((x) => x.id === ids.age) as { derived?: unknown }).derived).toBeUndefined();
    });

    it("SIBLING CONDITIONAL — the runtime evaluator agrees with what the inspector wrote", () => {
        const { schema, ids } = build();
        const next = updateField(schema, ids.list, { visible_when: { field_id: ids.siblings, equals: true } });
        const parsed = validateFormSchema(next);

        expect(evaluateFieldVisibility(ids.list, parsed, (id) => (id === ids.siblings ? true : undefined))).toBe(true);
        expect(evaluateFieldVisibility(ids.list, parsed, (id) => (id === ids.siblings ? false : undefined))).toBe(false);

        const always = updateField(next, ids.list, { visible_when: null });
        expect(evaluateFieldVisibility(ids.list, validateFormSchema(always), () => undefined)).toBe(true);
    });
});
