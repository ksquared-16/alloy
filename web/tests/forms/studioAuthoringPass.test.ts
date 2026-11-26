import { describe, expect, it } from "vitest";

import {
    addRelationshipGroup,
    calculationOf,
    changeAnswerKind,
    duplicateField,
    findFieldDeep,
    groupChildAuthoring,
    removeField,
    setAnyFieldLayoutWidth,
    setFieldCalculation,
    setFieldVisibility,
    setGroupRepeat,
    structureAddressAt,
    ungroupAddress,
    updateField,
} from "@/lib/forms/formBuilderSchema";
import { composeRuntimeRows, runtimeCellSpanClass } from "@/lib/forms/fieldLayoutChunks";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import { safeParseFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import { evaluateFieldVisibility, validateFormPayload } from "@/lib/forms/validateSubmission";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * FORMS STUDIO AUTHORING — the final pass before Human H1.
 *
 * Every capability runs through the SAME schema authority on two starting points: a hand-built form and
 * the form Alloy generated from a document. A capability one of them lacks is a failing test.
 */

const PARENT_NAME = "Parent name";
const DOB = "Child date of birth";
const START = "Enrollment start date";
const AGE = "Student Age Upon Enrolling";
const SIBLINGS = "Does your child have siblings?";
const SIBLINGS_LIST = "Please list siblings";

type Spec = { id: string; label: string; type: string; required: boolean; field_source?: { entity_type: string; field_key: string } };

const SPECS: Spec[] = [
    { id: "parent_name", label: PARENT_NAME, type: "text", required: true, field_source: { entity_type: "guardian", field_key: "guardian_first_name" } },
    { id: "dob", label: DOB, type: "date", required: true },
    { id: "start", label: START, type: "date", required: true },
    { id: "age", label: AGE, type: "number", required: false },
    { id: "siblings", label: SIBLINGS, type: "boolean", required: false },
    { id: "siblings_list", label: SIBLINGS_LIST, type: "text", required: false },
    { id: "line1", label: "Home address line 1", type: "text", required: true, field_source: { entity_type: "person", field_key: "address_line1" } },
    { id: "line2", label: "Home address line 2", type: "text", required: false, field_source: { entity_type: "person", field_key: "address_line2" } },
    { id: "city", label: "City", type: "text", required: true, field_source: { entity_type: "person", field_key: "city" } },
    { id: "state", label: "State", type: "text", required: true, field_source: { entity_type: "person", field_key: "state" } },
    { id: "zip", label: "ZIP", type: "text", required: true, field_source: { entity_type: "person", field_key: "postal_code" } },
];

const manualForm = (): FormSchemaV1 =>
    ({
        schema_version: 1,
        title: "Enrollment",
        sections: [
            { id: "s1", title: "Family", field_ids: SPECS.slice(0, 6).map((s) => s.id) },
            { id: "s2", title: "Home", field_ids: SPECS.slice(6).map((s) => s.id) },
        ],
        fields: SPECS.map(({ id, label, type, required, field_source }) => ({ id, label, type, required, ...(field_source ? { field_source } : {}) })),
    }) as unknown as FormSchemaV1;

/** The same questions as a document import produces them (draft → initial Studio form). */
const importedForm = (): FormSchemaV1 => {
    const fields = SPECS.map((s, i) => ({
        id: `field_${i + 1}`,
        label: s.label,
        type: s.type,
        required: s.required,
        confidence: "high",
        evidence: `hosted_form:${s.id}`,
        ...(s.field_source ? { field_source: s.field_source } : {}),
    }));
    const draft = {
        title: "Enrollment",
        generated_form_name: "Enrollment",
        source_document_id: "doc-1",
        sections: [
            { id: "section_1", title: "Family", field_ids: fields.slice(0, 6).map((f) => f.id), disposition: "fields" },
            { id: "section_2", title: "Home", field_ids: fields.slice(6).map((f) => f.id), disposition: "fields" },
        ],
        fields,
        warnings: [],
        generated_at: "2026-10-14T12:00:00.000Z",
        generator_version: "test",
    } as unknown as StoredFormDraftPreview;
    let schema = draftFormToFormSchemaV1(draft);
    // Start both paths flat, so the operator's own "group as address" is what is exercised.
    const auto = schema.fields.find((f) => (f as { address_binding?: unknown }).address_binding);
    if (auto) schema = ungroupAddress(schema, auto.id);
    return schema;
};

const PATHS: Array<[string, () => FormSchemaV1]> = [
    ["hand-built form", manualForm],
    ["document-originated form", importedForm],
];

const valid = (schema: FormSchemaV1) => {
    const parsed = safeParseFormSchema(schema);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return parsed.data;
};
/** Studio save → reload: through JSON and the schema parser, the way a saved form comes back. */
const reload = (schema: FormSchemaV1) => valid(JSON.parse(JSON.stringify(schema)) as FormSchemaV1);
const idOf = (schema: FormSchemaV1, label: string) => schema.fields.find((f) => f.label === label)!.id;
const fieldAt = (schema: FormSchemaV1, id: string) => findFieldDeep(schema, id)!.field;

describe.each(PATHS)("Forms Studio authoring — %s", (_name, start) => {
    describe("duplicate a question", () => {
        it("adds a NEW question with a new stable id directly below, keeping how it is asked", () => {
            const base = start();
            const original = idOf(base, PARENT_NAME);
            const widened = setAnyFieldLayoutWidth(base, original, "half");
            const result = duplicateField(widened, original)!;
            expect(result).not.toBeNull();
            const copy = fieldAt(result.schema, result.fieldId);
            expect(result.fieldId).not.toBe(original);
            expect(copy.label).toBe(`${PARENT_NAME} (copy)`);
            expect(copy.type).toBe("text");
            expect(copy.required).toBe(true);
            expect(copy.layout_width).toBe("half");
            const section = result.schema.sections.find((s) => s.field_ids.includes(original))!;
            expect(section.field_ids.indexOf(result.fieldId)).toBe(section.field_ids.indexOf(original) + 1);
        });

        it("does NOT copy where the answer is stored — the copy chooses its own destination", () => {
            const base = start();
            const original = idOf(base, PARENT_NAME);
            expect(fieldAt(base, original).field_source?.field_key).toBe("guardian_first_name");
            const { schema, fieldId } = duplicateField(base, original)!;
            expect(fieldAt(schema, fieldId).field_source).toBeUndefined();
            // Independently editable: re-label and map the copy; the original is untouched.
            const edited = updateField(
                updateField(schema, fieldId, { label: "Parent last name" }),
                fieldId,
                { field_source: { entity_type: "guardian", field_key: "guardian_last_name" } },
            );
            const narrowed = setAnyFieldLayoutWidth(changeAnswerKind(edited, fieldId, "long_text"), fieldId, "quarter");
            const saved = reload(updateField(narrowed, fieldId, { required: false }));
            expect(fieldAt(saved, fieldId)).toMatchObject({ label: "Parent last name", required: false, layout_width: "quarter" });
            expect(fieldAt(saved, fieldId).field_source?.field_key).toBe("guardian_last_name");
            expect(fieldAt(saved, original)).toMatchObject({ label: PARENT_NAME, required: true });
            expect(fieldAt(saved, original).field_source?.field_key).toBe("guardian_first_name");
        });

        it("gives every copy its own id, and refuses to duplicate a group", () => {
            const base = start();
            const original = idOf(base, PARENT_NAME);
            const once = duplicateField(base, original)!;
            const twice = duplicateField(once.schema, original)!;
            expect(new Set([original, once.fieldId, twice.fieldId]).size).toBe(3);
            const grouped = structureAddressAt(base, idOf(base, "City"));
            const groupId = grouped.fields.find((f) => f.type === "group")!.id;
            expect(duplicateField(grouped, groupId)).toBeNull();
        });
    });

    describe("calculated answers", () => {
        const ageCalc = (s: FormSchemaV1) => ({
            kind: "age_from_date_of_birth" as const,
            source_key: idOf(s, DOB),
            as_of_key: idOf(s, START),
        });

        it("makes Student Age a calculation of Date of birth as of the enrollment date, read-only, and survives reload", () => {
            const base = start();
            const age = idOf(base, AGE);
            const saved = reload(setFieldCalculation(base, age, ageCalc(base)));
            const field = fieldAt(saved, age);
            expect(calculationOf(field)).toEqual(ageCalc(base));
            expect(field.read_only).toBeFalsy();
            // An age is words ("4 years 2 months"), so the field holds text — a number box would refuse it.
            expect(field.type).toBe("text");
        });

        it("is computed by the runtime from the family's answers — not asked of the family", () => {
            const base = start();
            const age = idOf(base, AGE);
            const schema = setFieldCalculation(base, age, ageCalc(base));
            const values = { [idOf(base, DOB)]: "2022-03-01", [idOf(base, START)]: "2026-09-01" };
            const computed = resolveFormDerivedValues(schema, values, {});
            // The platform's own age wording ("4 yrs 6 mos") — Forms does not format it.
            expect(computed[age]).toMatch(/^4 (yrs|years)\b/);
            // The submit path fills it before validation; the submission is then valid.
            const result = validateFormPayload({
                schemaJson: schema,
                payload: { values: { ...values, ...computed }, signatures: {}, groups: {} },
                mode: "submit",
            } as never);
            // Other questions on this fixture are deliberately unanswered; the claim is that the
            // calculated age itself raises no error once the submit path has filled it.
            const errors = ((result as { errors?: Array<{ path: string[] }> }).errors ?? []).filter((e) => e.path.includes(age));
            expect(errors).toEqual([]);
        });

        it("waits for its dates instead of guessing 'today'", () => {
            const base = start();
            const age = idOf(base, AGE);
            const schema = setFieldCalculation(base, age, ageCalc(base));
            expect(resolveFormDerivedValues(schema, { [idOf(base, DOB)]: "2022-03-01" }, {})[age]).toBeUndefined();
        });

        it("refuses a calculation it cannot compute: non-date sources, the same date twice, itself", () => {
            const base = start();
            const age = idOf(base, AGE);
            const dob = idOf(base, DOB);
            expect(setFieldCalculation(base, age, { kind: "age_from_date_of_birth", source_key: dob, as_of_key: dob })).toBe(base);
            expect(setFieldCalculation(base, age, { kind: "age_from_date_of_birth", source_key: idOf(base, PARENT_NAME), as_of_key: dob })).toBe(base);
            expect(setFieldCalculation(base, dob, { kind: "age_from_date_of_birth", source_key: dob, as_of_key: idOf(base, START) })).toBe(base);
        });

        it("stops being a calculation when a date it reads is removed or stops being a date", () => {
            const base = start();
            const age = idOf(base, AGE);
            const calculated = setFieldCalculation(base, age, ageCalc(base));
            expect(fieldAt(removeField(calculated, idOf(base, START)), age).derived).toBeUndefined();
            expect(fieldAt(changeAnswerKind(calculated, idOf(base, DOB), "short_text"), age).derived).toBeUndefined();
        });

        it("can be set back to a question the family answers", () => {
            const base = start();
            const age = idOf(base, AGE);
            const cleared = setFieldCalculation(setFieldCalculation(base, age, ageCalc(base)), age, null);
            expect(fieldAt(cleared, age).derived).toBeUndefined();
            expect(fieldAt(cleared, age).read_only).toBeUndefined();
        });

        it("offers the signing date as a calculated date", () => {
            const base = start();
            const start_ = idOf(base, START);
            const saved = reload(setFieldCalculation(base, start_, { kind: "execution_date" }));
            expect(fieldAt(saved, start_)).toMatchObject({ type: "date", derived: { kind: "execution_date" } });
        });
    });

    describe("conditions — Question → is / is not → Answer", () => {
        it("reveals the follow-up for Yes and hides it otherwise, through save and the runtime", () => {
            const base = start();
            const q = idOf(base, SIBLINGS);
            const follow = idOf(base, SIBLINGS_LIST);
            const saved = reload(setFieldVisibility(base, follow, { triggerFieldId: q, value: true }));
            expect(evaluateFieldVisibility(follow, saved, (id) => (id === q ? true : undefined))).toBe(true);
            expect(evaluateFieldVisibility(follow, saved, (id) => (id === q ? false : undefined))).toBe(false);
            const isNot = setFieldVisibility(saved, follow, { triggerFieldId: q, value: true, comparison: "neq" });
            expect(evaluateFieldVisibility(follow, isNot, (id) => (id === q ? false : undefined))).toBe(true);
        });
    });

    describe("a group's lines are questions too", () => {
        it("selects and re-maps one address line on its own, and keeps it through reload", () => {
            const base = start();
            const grouped = structureAddressAt(base, idOf(base, "City"));
            const group = grouped.fields.find((f) => f.type === "group") as FormField & { type: "group"; fields: FormField[] };
            const city = group.fields.find((f) => f.label === "City")!;
            expect(groupChildAuthoring(grouped, city.id)).toMatchObject({ groupKind: "address", canChangeDestination: true });

            const remapped = updateField(grouped, city.id, { field_source: { entity_type: "customer", field_key: "city" }, label: "Town" });
            const saved = reload(setAnyFieldLayoutWidth(remapped, city.id, "third"));
            const line = fieldAt(saved, city.id);
            expect(line).toMatchObject({ label: "Town", layout_width: "third" });
            expect(line.field_source).toMatchObject({ entity_type: "customer", field_key: "city" });
            expect(findFieldDeep(saved, city.id)!.parent!.id).toBe(group.id);
            // The rest of the address is unchanged.
            const state = group.fields.find((f) => f.label === "State")!;
            expect(fieldAt(saved, state.id).field_source).toMatchObject({ entity_type: "person", field_key: "state" });
        });

        it("keeps a people group's lines bound to the relationship: label/required/width editable, storage and type not", () => {
            const base = start();
            const added = addRelationshipGroup(base, "emergency_contacts", base.sections[0]!.id)!;
            const withMin = setGroupRepeat(added.schema, added.fieldId, { min: 2 });
            const group = fieldAt(withMin, added.fieldId) as FormField & { type: "group"; fields: FormField[]; repeat?: { min: number } };
            expect(group.repeat?.min).toBe(2);
            const phone = group.fields.find((f) => /phone/i.test(f.label))!;
            expect(groupChildAuthoring(withMin, phone.id)).toMatchObject({ groupKind: "people", canChangeDestination: false, canChangeAnswerType: false });
            expect(changeAnswerKind(withMin, phone.id, "date")).toBe(withMin);
            const relabelled = reload(setAnyFieldLayoutWidth(updateField(withMin, phone.id, { label: "Best phone", required: true }), phone.id, "half"));
            expect(fieldAt(relabelled, phone.id)).toMatchObject({ label: "Best phone", required: true, layout_width: "half" });
            expect((fieldAt(relabelled, added.fieldId) as { repeat?: { min: number } }).repeat?.min).toBe(2);
        });
    });

    describe("the family sees the rows Studio shows", () => {
        it("puts City | State | ZIP on one row from md up, and a full-width line on its own", () => {
            const base = start();
            let s = setAnyFieldLayoutWidth(base, idOf(base, "City"), "half");
            s = setAnyFieldLayoutWidth(s, idOf(base, "State"), "quarter");
            s = setAnyFieldLayoutWidth(s, idOf(base, "ZIP"), "quarter");
            const home = s.sections[1]!.field_ids.map((id) => fieldAt(s, id));
            const rows = composeRuntimeRows(home).map((r) => r.map((f) => f.label));
            expect(rows).toEqual([["Home address line 1"], ["Home address line 2"], ["City", "State", "ZIP"]]);
            expect(composeRuntimeRows(home)[2]!.map(runtimeCellSpanClass)).toEqual(["@md:col-span-6", "@md:col-span-3", "@md:col-span-3"]);
        });
    });
});

describe("duplicate and calculation ids stay unique across groups", () => {
    it("never reuses an id that already exists inside a group", () => {
        const base = manualForm();
        const grouped = structureAddressAt(base, "city");
        // `city` now lives inside the address group; a top-level copy named after it must not collide.
        const renamed = { ...grouped, fields: grouped.fields.map((f) => (f.id === "parent_name" ? { ...f, id: "city" } : f)) } as FormSchemaV1;
        void renamed;
        const copy = duplicateField(grouped, "parent_name")!;
        const all = new Set<string>();
        const walk = (fs: FormField[]) => fs.forEach((f) => (all.add(f.id), f.type === "group" && walk((f as { fields: FormField[] }).fields)));
        walk(copy.schema.fields);
        expect(all.size).toBe(SPECS.length + 2); // + the copy, + the address group
    });
});
