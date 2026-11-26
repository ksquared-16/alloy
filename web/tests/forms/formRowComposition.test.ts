import { describe, expect, it } from "vitest";
import { createBlankSchema, addField, addSection, addRegistryField } from "@/lib/forms/formBuilderSchema";
import {
    groupFieldsIntoRows,
    placementFromField,
    setFieldPlacement,
    setFieldLayoutWidth,
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

    it("groups quarter-width fields up to four per row", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        for (let i = 0; i < 4; i++) {
            const r = addField(schema, { type: "short_text", label: `Q${i + 1}`, sectionId: sec });
            schema = setFieldLayoutWidth(r.schema, r.fieldId, "quarter");
        }
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveLength(4);
    });

    it("starts new row when width units exceed 12", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        let r = addField(schema, { type: "short_text", label: "A", sectionId: sec });
        schema = setFieldLayoutWidth(r.schema, r.fieldId, "third");
        r = addField(schema, { type: "short_text", label: "B", sectionId: sec });
        schema = setFieldLayoutWidth(r.schema, r.fieldId, "third");
        r = addField(schema, { type: "short_text", label: "C", sectionId: sec });
        schema = setFieldLayoutWidth(r.schema, r.fieldId, "third");
        r = addField(schema, { type: "short_text", label: "D", sectionId: sec });
        schema = setFieldLayoutWidth(r.schema, r.fieldId, "third");
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveLength(3);
        expect(rows[1]).toHaveLength(1);
    });

    it("packs two half rows across four consecutive half-width fields", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        const labels = ["R1-A", "R1-B", "R2-A", "R2-B"];
        for (const label of labels) {
            const r = addField(schema, { type: "short_text", label, sectionId: sec });
            schema = setFieldLayoutWidth(r.schema, r.fieldId, "half");
        }
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveLength(2);
        expect(rows[1]).toHaveLength(2);
        expect(rows[0]!.map((id) => map.get(id)?.label)).toEqual(["R1-A", "R1-B"]);
        expect(rows[1]!.map((id) => map.get(id)?.label)).toEqual(["R2-A", "R2-B"]);
    });

    it("packs mixed third, half, and quarter rows on the 12-unit grid", () => {
        let schema = createBlankSchema("Test");
        const sec = schema.sections[0]!.id;
        const specs: Array<{ label: string; width: "third" | "half" | "quarter" }> = [
            { label: "T1", width: "third" },
            { label: "T2", width: "third" },
            { label: "T3", width: "third" },
            { label: "H1", width: "half" },
            { label: "H2", width: "half" },
            { label: "Q1", width: "quarter" },
            { label: "Q2", width: "quarter" },
            { label: "Q3", width: "quarter" },
            { label: "Q4", width: "quarter" },
        ];
        for (const spec of specs) {
            const r = addField(schema, { type: "short_text", label: spec.label, sectionId: sec });
            schema = setFieldLayoutWidth(r.schema, r.fieldId, spec.width);
        }
        const map = new Map(schema.fields.map((f) => [f.id, f]));
        const rows = groupFieldsIntoRows(schema.sections[0]!.field_ids, map);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toHaveLength(3);
        expect(rows[1]).toHaveLength(2);
        expect(rows[2]).toHaveLength(4);
        expect(rows[0]!.map((id) => map.get(id)?.label)).toEqual(["T1", "T2", "T3"]);
        expect(rows[1]!.map((id) => map.get(id)?.label)).toEqual(["H1", "H2"]);
        expect(rows[2]!.map((id) => map.get(id)?.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
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
