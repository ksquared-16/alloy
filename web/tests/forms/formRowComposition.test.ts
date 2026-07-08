import { describe, expect, it } from "vitest";
import { createBlankSchema, addField, addSection, addRegistryField } from "@/lib/forms/formBuilderSchema";
import {
    groupFieldsIntoRows,
    placementFromField,
    setFieldPlacement,
    moveFieldBetweenSections,
    reorderField,
    reorderFieldAfter,
} from "@/lib/forms/formRowComposition";
import { SYSTEM_FIELD_BY_ID } from "@/lib/forms/systemFieldRegistry";

describe("formRowComposition", () => {
    it("groups half-width fields on same row", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        let r = addField(schema, { type: "short_text", label: "First", sectionId: sec });
        schema = r.schema;
        r = addField(schema, { type: "short_text", label: "Last", sectionId: sec });
        schema = setFieldPlacement(r.schema, r.fieldId, "same-line");
        const firstId = schema.sections[0]!.field_ids[0]!;
        schema = setFieldPlacement(schema, firstId, "same-line");
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveLength(2);
    });

    it("same-line placement marks previous field half", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        let r = addField(schema, { type: "short_text", label: "A", sectionId: sec });
        schema = r.schema;
        r = addField(schema, { type: "short_text", label: "B", sectionId: sec });
        schema = setFieldPlacement(r.schema, r.fieldId, "same-line");
        const ids = schema.sections[0]!.field_ids;
        expect(schema.fields.find((f) => f.id === ids[0])?.layout_width).toBe("half");
        expect(schema.fields.find((f) => f.id === ids[1])?.layout_width).toBe("half");
    });

    it("new-line-below starts a new row", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        let r = addField(schema, { type: "short_text", label: "A", sectionId: sec });
        schema = r.schema;
        r = addField(schema, { type: "short_text", label: "B", sectionId: sec });
        schema = r.schema;
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(2);
    });

    it("placementFromField reads layout_width", () => {
        const schema = createBlankSchema("Test");
        const { schema: s, fieldId } = addField(schema, {
            type: "short_text",
            label: "X",
            sectionId: schema.sections[0]!.id,
        });
        const half = setFieldPlacement(s, fieldId, "same-line");
        const field = half.fields.find((f) => f.id === fieldId)!;
        expect(placementFromField(field)).toBe("same-line");
    });

    it("moveFieldBetweenSections updates section field_ids", () => {
        let schema = createBlankSchema("Test");
        const firstSec = schema.sections[0]!.id;
        const added = addField(schema, { type: "short_text", label: "Q", sectionId: firstSec });
        schema = added.schema;
        const fid = added.fieldId;
        const { schema: withTwoSecs, sectionId: secondSecId } = addSection(schema, "Medical");
        schema = moveFieldBetweenSections(withTwoSecs, fid, secondSecId);
        expect(schema.sections.find((s) => s.id === secondSecId)?.field_ids).toContain(fid);
        expect(schema.sections.find((s) => s.id === firstSec)?.field_ids).not.toContain(fid);
    });

    it("reorderField moves across sections at index", () => {
        let schema = createBlankSchema("Test");
        const secA = schema.sections[0]!.id;
        const a = addField(schema, { type: "short_text", label: "A", sectionId: secA });
        schema = a.schema;
        const b = addField(schema, { type: "short_text", label: "B", sectionId: secA });
        schema = b.schema;
        const { schema: withMed, sectionId: secB } = addSection(schema, "Medical");
        schema = reorderField(withMed, a.fieldId, secB, null);
        expect(schema.sections.find((s) => s.id === secB)?.field_ids[0]).toBe(a.fieldId);
    });

    it("reorderFieldAfter inserts after anchor", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        const a = addField(schema, { type: "short_text", label: "A", sectionId: sec });
        schema = a.schema;
        const b = addField(schema, { type: "short_text", label: "B", sectionId: sec });
        schema = b.schema;
        const c = addField(schema, { type: "short_text", label: "C", sectionId: sec });
        schema = reorderFieldAfter(schema, c.fieldId, sec, a.fieldId);
        const ids = schema.sections[0]!.field_ids;
        expect(ids).toEqual([a.fieldId, c.fieldId, b.fieldId]);
    });
});

describe("addRegistryField", () => {
    it("adds canonical child first name with binding", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("child_first_name");
        expect(entry).toBeTruthy();
        const schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        const { schema: next, fieldId } = addRegistryField(schema, entry!, sec);
        const field = next.fields.find((f) => f.id === fieldId);
        expect(field?.label).toBe("Child first name");
        expect(field?.field_source?.field_key).toBe("child_first_name");
        expect(field?.layout_width).toBe("full");
    });
});
