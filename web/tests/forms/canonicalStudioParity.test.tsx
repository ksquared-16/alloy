import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    addFieldOption,
    addRelationshipGroup,
    canStructureAddressAt,
    changeAnswerKind,
    conditionTriggerOf,
    nameCompositionParts,
    removeFieldOption,
    renameFieldOption,
    setFieldVisibility,
    setGroupRepeat,
    splitFieldIntoParts,
    structureAddressAt,
    ungroupAddress,
} from "@/lib/forms/formBuilderSchema";
import { setFieldLayoutWidth } from "@/lib/forms/formRowComposition";
import { peopleGroupOptions, relationshipCollectionGroupField } from "@/lib/forms/relationshipCollectionGroup";
import { safeParseFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import { evaluateFieldVisibility, validateFormPayload } from "@/lib/forms/validateSubmission";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

/**
 * ONE FORMS STUDIO.
 *
 * "Anything an operator can do to a normal Form in Forms Studio should also be available when the Form
 * originated from a document." Every capability below runs, through the SAME schema authority, on two
 * starting points: a hand-built form, and the form Alloy generated from a document. A capability that
 * only one of them has is a failing test, not a footnote.
 */

const RESTRAINING = "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?";
const FOLLOW_UP = "Please describe the order and who it applies to.";

const manualForm = (): FormSchemaV1 =>
    ({
        schema_version: 1,
        title: "Enrollment",
        sections: [{ id: "s1", title: "Family", field_ids: ["restraining", "follow_up", "program", "guardian_name", "line1", "line2", "city", "state", "zip"] }],
        fields: [
            { id: "restraining", type: "text", label: RESTRAINING, required: false },
            { id: "follow_up", type: "text", label: FOLLOW_UP, required: false },
            { id: "program", type: "select", label: "Program", required: false, static_options: [{ value: "full_day", label: "Full day" }, { value: "half_day", label: "Half day" }] },
            { id: "guardian_name", type: "text", label: "Parent/Guardian #1 Name", required: true },
            { id: "line1", type: "text", label: "Home address line 1", required: true, field_source: { entity_type: "person", field_key: "address_line1" } },
            { id: "line2", type: "text", label: "Home address line 2", required: false, field_source: { entity_type: "person", field_key: "address_line2" } },
            { id: "city", type: "text", label: "City", required: true, field_source: { entity_type: "person", field_key: "city" } },
            { id: "state", type: "text", label: "State", required: true, field_source: { entity_type: "person", field_key: "state" } },
            { id: "zip", type: "text", label: "ZIP", required: true, field_source: { entity_type: "person", field_key: "postal_code" } },
        ],
    }) as unknown as FormSchemaV1;

/** The same questions as a document import produces them (draft → initial Studio form). */
const importedForm = (): FormSchemaV1 => {
    const fields = manualForm().fields.map((f, i) => ({
        id: `field_${i + 1}`,
        label: f.label,
        type: f.type,
        required: f.required,
        confidence: "high",
        evidence: `hosted_form:${f.id}`,
        ...((f as unknown as { static_options?: Array<{ label: string }> }).static_options
            ? { options: (f as unknown as { static_options: Array<{ label: string }> }).static_options.map((o) => o.label) }
            : {}),
        ...(f.field_source ? { field_source: f.field_source } : {}),
    }));
    // The importer groups recognised address runs on its own; keep them flat here so the operator's
    // own "group as address" action is what is exercised — exactly as for a hand-built form.
    const draft = {
        title: "Enrollment",
        generated_form_name: "Enrollment",
        source_document_id: "doc-1",
        sections: [
            { id: "section_1", title: "Family", field_ids: fields.slice(0, 4).map((f) => f.id), disposition: "fields" },
            { id: "section_2", title: "Home", field_ids: fields.slice(4).map((f) => f.id), disposition: "fields" },
        ],
        fields,
        warnings: [],
        generated_at: "2026-10-09T12:00:00.000Z",
        generator_version: "test",
    } as unknown as StoredFormDraftPreview;
    let schema = draftFormToFormSchemaV1(draft);
    // Undo the importer's own address grouping so both paths start flat.
    const auto = schema.fields.find((f) => (f as { address_binding?: unknown }).address_binding);
    if (auto) schema = ungroupAddress(schema, auto.id);
    return schema;
};

const PATHS: Array<[string, () => FormSchemaV1, (label: string) => string]> = [
    ["hand-built form", manualForm, (label) => manualForm().fields.find((f) => f.label === label)!.id],
    ["document-originated form", importedForm, (label) => importedForm().fields.find((f) => f.label === label)!.id],
];

const valid = (schema: FormSchemaV1) => {
    const parsed = safeParseFormSchema(schema);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return parsed.data;
};
const field = (schema: FormSchemaV1, id: string) => schema.fields.find((f) => f.id === id)!;

describe.each(PATHS)("Forms Studio capabilities — %s", (_name, start, idOf) => {
    const restraining = idOf(RESTRAINING);
    const followUp = idOf(FOLLOW_UP);
    const program = idOf("Program");

    it("answer type: Short answer → Yes / No, then it controls a follow-up", () => {
        let schema = changeAnswerKind(start(), restraining, "boolean");
        expect(field(schema, restraining).type).toBe("boolean");
        expect(field(schema, restraining).label).toBe(RESTRAINING);
        schema = setFieldVisibility(schema, followUp, { triggerFieldId: restraining, value: true });
        expect(conditionTriggerOf(field(schema, followUp))).toBe(restraining);
        const published = valid(schema);
        expect(evaluateFieldVisibility(followUp, published, (k) => (k === restraining ? true : undefined))).toBe(true);
        expect(evaluateFieldVisibility(followUp, published, (k) => (k === restraining ? false : undefined))).toBe(false);
    });

    it("answer type: a follow-up whose rule the new type cannot meet goes back to always asked", () => {
        let schema = changeAnswerKind(start(), restraining, "boolean");
        schema = setFieldVisibility(schema, followUp, { triggerFieldId: restraining, value: true });
        schema = changeAnswerKind(schema, restraining, "date");
        expect(conditionTriggerOf(field(schema, followUp))).toBeNull();
        valid(schema);
    });

    it("answer type: Yes / No → Dropdown keeps a usable Yes / No choice set", () => {
        const schema = changeAnswerKind(changeAnswerKind(start(), restraining, "boolean"), restraining, "select");
        expect((field(schema, restraining) as unknown as { static_options: Array<{ label: string }> }).static_options.map((o) => o.label)).toEqual(["Yes", "No"]);
        valid(schema);
    });

    it("choices: add, rename (value kept), remove (releases a follow-up waiting for it)", () => {
        let schema = addFieldOption(start(), program, "Extended day");
        const options = () => (field(schema, program) as unknown as { static_options: Array<{ value: string; label: string }> }).static_options;
        expect(options().map((o) => o.label)).toContain("Extended day");
        const halfValue = options().find((o) => o.label === "Half day")!.value;
        const halfIndex = options().findIndex((o) => o.label === "Half day");
        schema = renameFieldOption(schema, program, halfIndex, "Half-day program");
        expect(options()[halfIndex]).toEqual({ value: halfValue, label: "Half-day program" });
        schema = setFieldVisibility(schema, followUp, { triggerFieldId: program, value: halfValue });
        expect(conditionTriggerOf(field(schema, followUp))).toBe(program);
        schema = removeFieldOption(schema, program, halfIndex);
        expect(conditionTriggerOf(field(schema, followUp))).toBeNull();
        valid(schema);
    });

    it("repeatable people: Emergency contacts, + Add another, Minimum 2 — enforced on submit", () => {
        const r = addRelationshipGroup(start(), "emergency_contacts", start().sections[0]!.id)!;
        let schema = setGroupRepeat(r.schema, r.fieldId, { min: 2 });
        const group = field(schema, r.fieldId) as FormField & {
            fields: FormField[];
            repeat: { min: number };
            collection_binding: { collection_provider_ref: string };
        };
        expect(group.label).toBe("Emergency Contacts");
        expect(group.repeat.min).toBe(2);
        expect(group.collection_binding.collection_provider_ref).toBe("person.contact_role.emergency_contacts");
        expect(group.fields.map((f) => f.label)).toEqual(["Full name", "Phone", "Relationship type", "Address"]);
        schema = valid(schema);
        const row = (n: number) => ({ instance_key: `r${n}`, values: { [`${r.fieldId}__full_name`]: `Contact ${n}` } });
        const one = validateFormPayload({ schemaJson: schema, payload: { values: {}, groups: { [r.fieldId]: [row(1)] } }, mode: "submit" });
        expect(one.ok).toBe(false);
        const groupErrors = (res: ReturnType<typeof validateFormPayload>) =>
            res.ok ? [] : res.errors.filter((e) => e.path[0] === r.fieldId || e.path[1] === r.fieldId).map((e) => e.code);
        // The other questions on this form are required too; only the GROUP's own verdict is asserted.
        expect(groupErrors(one)).toContain("too_small");
        const two = validateFormPayload({ schemaJson: schema, payload: { values: {}, groups: { [r.fieldId]: [row(1), row(2)] } }, mode: "submit" });
        expect(groupErrors(two)).toEqual([]);
    });

    it("a maximum below the minimum is refused", () => {
        const r = addRelationshipGroup(start(), "emergency_contacts", start().sections[0]!.id)!;
        const schema = setGroupRepeat(r.schema, r.fieldId, { min: 3, max: 2 });
        expect(schema).toBe(r.schema);
    });

    it("physician / provider information is the canonical Physicians relationship: name and phone", () => {
        const r = addRelationshipGroup(start(), "child_physicians", start().sections[0]!.id)!;
        const group = field(r.schema, r.fieldId) as FormField & { fields: FormField[] };
        expect(group.label).toBe("Physicians");
        expect(group.fields.map((f) => [f.label, f.field_source?.field_key])).toEqual([
            ["Full name", "full_name"],
            ["Phone", "phone"],
        ]);
        valid(r.schema);
    });

    it("structured address: the lines become one address, City | State | ZIP side by side, each line still mapped", () => {
        const line1 = idOf("Home address line 1");
        expect(canStructureAddressAt(start(), line1)).toBe(true);
        const schema = structureAddressAt(start(), line1);
        const group = schema.fields.find((f) => (f as { address_binding?: unknown }).address_binding) as FormField & {
            fields: FormField[];
            address_binding: { subject: string };
        };
        expect(group.fields.map((f) => f.field_source?.field_key)).toEqual(["address_line1", "address_line2", "city", "state", "postal_code"]);
        expect(group.fields.map((f) => f.layout_width ?? "full")).toEqual(["full", "full", "half", "quarter", "quarter"]);
        expect(group.address_binding.subject).toBe("person");
        valid(schema);
        // …and back to individual questions on request.
        const flat = ungroupAddress(schema, group.id);
        expect(flat.fields.some((f) => f.id === group.id)).toBe(false);
        valid(flat);
    });

    it("composition: Parent/Guardian #1 Name → First name | Last name, half width each", () => {
        const name = idOf("Parent/Guardian #1 Name");
        const original = field(start(), name);
        const schema = splitFieldIntoParts(start(), name, nameCompositionParts(original));
        const section = schema.sections.find((s) => s.field_ids.some((id) => id.startsWith(name)))!;
        const parts = section.field_ids.filter((id) => id.startsWith(name)).map((id) => field(schema, id));
        expect(parts.map((p) => p.layout_width)).toEqual(["half", "half"]);
        expect(parts.map((p) => p.label.toLowerCase())).toEqual([expect.stringContaining("first"), expect.stringContaining("last")]);
        valid(schema);
    });

    it("layout width: any question can be set side by side", () => {
        const schema = setFieldLayoutWidth(start(), program, "half");
        expect(field(schema, program).layout_width).toBe("half");
    });
});

describe("there is one Forms Studio, not two", () => {
    const builder = web("app/adminV2/pos/ProcessingFormBuilder.tsx");
    const imported = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
    const inspector = web("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");

    it("both forms use the same canvas, inspector and authoring", () => {
        for (const src of [builder, imported]) {
            expect(src).toContain('from "./ProcessingFormCanvas"');
            expect(src).toContain('from "./ProcessingFormQuestionInspector"');
            expect(src).toContain('from "./useFormStudioAuthoring"');
            expect(src).toContain("authoring.canvasProps");
            expect(src).toContain("authoring.renderSectionInspector");
            expect(src).toContain("authoring.overlays");
            expect(src).toContain("authoring.removeQuestion");
        }
    });

    it("the document-originated form no longer draws add/remove controls wired to nothing", () => {
        expect(imported).not.toContain("onAddQuestion={() => {}}");
        expect(imported).not.toContain("onAddSection={() => {}}");
        expect(imported).not.toContain("onRemove={() => setSelectedFieldId(null)}");
    });

    it("no imported-only editor, field creator or condition engine remains", () => {
        expect(imported).not.toContain("function CreateFieldPanel");
        expect(inspector).toContain("ProcessingCreateFieldPanel");
        expect(inspector).toContain("ConditionEditor");
        expect(inspector).toContain("changeAnswerKind");
        expect(inspector).toContain("ChoicesEditor");
        expect(inspector).toContain("GroupPanel");
    });

    it("people groups come from the canonical relationship definitions — nothing names a relationship", () => {
        const labels = peopleGroupOptions().map((g) => g.label);
        expect(labels).toEqual(expect.arrayContaining(["Emergency Contacts", "Authorized Pickup People", "Physicians", "Parents / Guardians"]));
        for (const src of [web("lib/forms/relationshipCollectionGroup.ts"), web("app/adminV2/pos/useFormStudioAuthoring.tsx")]) {
            expect(src).not.toMatch(/"emergency_contacts"|"authorized_pickups"|"child_physicians"/);
        }
        expect(relationshipCollectionGroupField("not_a_relationship", "x")).toBeNull();
    });

    it("an importer-projected group and a Studio-added group are built by the same function", () => {
        expect(web("lib/pos/processingCase/formDraft/draftFormToFormSchemaV1.ts")).toContain("collectionGroupField(");
        expect(web("lib/forms/formBuilderSchema.ts")).toContain("relationshipCollectionGroupField(");
    });
});
