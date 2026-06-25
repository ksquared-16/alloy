import { describe, it, expect } from "vitest";
import {
    createBlankSchema,
    addField,
    updateField,
    removeField,
    moveFieldWithinSection,
    addSection,
    renameSection,
    removeSection,
} from "@/lib/forms/formBuilderSchema";
import { safeParseFormSchema } from "@/lib/forms/schema";

function valid(schema: unknown): boolean {
    return safeParseFormSchema(schema).success;
}

describe("formBuilderSchema", () => {
    it("creates a blank, valid one-section schema", () => {
        const s = createBlankSchema("Health Form");
        expect(s.title).toBe("Health Form");
        expect(s.sections).toHaveLength(1);
        expect(s.fields).toHaveLength(0);
        // empty fields is structurally valid (publish requires >=1, separate check)
        expect(valid(s)).toBe(true);
    });

    it("adds each field type and stays schema-valid", () => {
        let s = createBlankSchema("F");
        const types = ["short_text", "long_text", "date", "number", "boolean", "file_ref", "signature"] as const;
        for (const t of types) s = addField(s, { type: t, label: `${t} field`, required: t === "short_text" }).schema;
        s = addField(s, { type: "select", label: "Program", options: [{ value: "am", label: "AM" }, { value: "pm", label: "PM" }] }).schema;
        expect(s.fields).toHaveLength(types.length + 1);
        expect(valid(s)).toBe(true);
        const longText = s.fields.find((f) => f.label === "long_text field")!;
        expect(longText.type).toBe("text");
        expect((longText as { multiline?: boolean }).multiline).toBe(true);
        const select = s.fields.find((f) => f.type === "select")!;
        expect((select as { static_options?: unknown[] }).static_options).toHaveLength(2);
    });

    it("assigns new fields to the first section's field_ids", () => {
        let s = createBlankSchema("F");
        const r = addField(s, { type: "short_text", label: "Name" });
        s = r.schema;
        expect(s.sections[0].field_ids).toContain(r.fieldId);
    });

    it("updates label/required/help/options and field_source binding", () => {
        let s = createBlankSchema("F");
        const { schema, fieldId } = addField(s, { type: "select", label: "Program", options: [{ value: "a", label: "A" }] });
        s = schema;
        s = updateField(s, fieldId, { label: "Program choice", required: true, description: "Pick one", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], field_source: { entity_type: "inquiry_child", field_key: "program" } });
        const f = s.fields.find((x) => x.id === fieldId)!;
        expect(f.label).toBe("Program choice");
        expect(f.required).toBe(true);
        expect((f as { description?: string }).description).toBe("Pick one");
        expect((f as { static_options?: unknown[] }).static_options).toHaveLength(2);
        expect((f as { field_source?: { field_key?: string } }).field_source?.field_key).toBe("program");
        expect(valid(s)).toBe(true);
    });

    it("removes a field from fields and section references", () => {
        let s = createBlankSchema("F");
        const { schema, fieldId } = addField(s, { type: "short_text", label: "Name" });
        s = removeField(schema, fieldId);
        expect(s.fields).toHaveLength(0);
        expect(s.sections[0].field_ids).not.toContain(fieldId);
        expect(valid(s)).toBe(true);
    });

    it("reorders fields within a section", () => {
        let s = createBlankSchema("F");
        const a = addField(s, { type: "short_text", label: "A" });
        s = a.schema;
        const b = addField(s, { type: "short_text", label: "B" });
        s = b.schema;
        expect(s.sections[0].field_ids).toEqual([a.fieldId, b.fieldId]);
        s = moveFieldWithinSection(s, b.fieldId, -1);
        expect(s.sections[0].field_ids).toEqual([b.fieldId, a.fieldId]);
        // no-op at boundary
        s = moveFieldWithinSection(s, b.fieldId, -1);
        expect(s.sections[0].field_ids).toEqual([b.fieldId, a.fieldId]);
    });

    it("adds, renames, and removes sections (header text)", () => {
        let s = createBlankSchema("F");
        const add = addSection(s, "Parent details");
        s = add.schema;
        expect(s.sections).toHaveLength(2);
        const f = addField(s, { type: "short_text", label: "Email", sectionId: add.sectionId });
        s = f.schema;
        expect(s.sections.find((x) => x.id === add.sectionId)!.field_ids).toContain(f.fieldId);
        s = renameSection(s, add.sectionId, "Guardian details");
        expect(s.sections.find((x) => x.id === add.sectionId)!.title).toBe("Guardian details");
        s = removeSection(s, add.sectionId);
        expect(s.sections).toHaveLength(1);
        expect(s.fields.find((x) => x.id === f.fieldId)).toBeUndefined(); // its field removed too
        expect(valid(s)).toBe(true);
    });

    it("generates unique field ids from duplicate labels", () => {
        let s = createBlankSchema("F");
        const a = addField(s, { type: "short_text", label: "Name" });
        s = a.schema;
        const b = addField(s, { type: "short_text", label: "Name" });
        s = b.schema;
        expect(a.fieldId).not.toBe(b.fieldId);
        expect(valid(s)).toBe(true);
    });
});
