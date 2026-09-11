import { describe, expect, it } from "vitest";

import { buildPaperworkRegions } from "@/lib/forms/pdf/paperworkRegions";

/**
 * The join that makes the source document an editing canvas.
 *
 * What these protect is a doctrine, not a layout: the MAPPING decides what is selectable and the
 * document only says where. Every case below is one way that could quietly stop being true.
 */
describe("buildPaperworkRegions", () => {
    const widget = (name: string | null, page = 1): { name: string | null; page: number; bbox: [number, number, number, number] } => ({
        name,
        page,
        bbox: [10, 20, 110, 40],
    });

    it("returns a region for each mapped widget, carrying the schema field it edits", () => {
        const { regions } = buildPaperworkRegions(
            { child_first_name: { field_id: "field_1" }, child_last_name: { field_id: "field_2" } },
            [widget("child_first_name"), widget("child_last_name", 2)],
        );

        expect(regions).toEqual([
            { field_id: "field_1", pdf_field: "child_first_name", page: 1, bbox: [10, 20, 110, 40] },
            { field_id: "field_2", pdf_field: "child_last_name", page: 2, bbox: [10, 20, 110, 40] },
        ]);
    });

    it("does NOT offer a widget the mapping never named", () => {
        // The whole guard against geometry becoming the semantic authority: an operator must not be
        // able to create a binding by clicking an unmapped rectangle.
        const { regions } = buildPaperworkRegions({ child_first_name: { field_id: "field_1" } }, [
            widget("child_first_name"),
            widget("unmapped_scribble_box"),
        ]);

        expect(regions.map((r) => r.pdf_field)).toEqual(["child_first_name"]);
    });

    it("matches widget names case-insensitively", () => {
        // A document re-exported by other software can change widget-name case. A case-sensitive
        // match would return nothing at all and leave an editor on a page nothing can be clicked on.
        const { regions } = buildPaperworkRegions({ Child_First_Name: { field_id: "field_1" } }, [
            widget("child_first_name"),
        ]);

        expect(regions).toHaveLength(1);
        expect(regions[0].field_id).toBe("field_1");
    });

    it("lets one fact print in several boxes, all resolving to the same field", () => {
        const { regions } = buildPaperworkRegions(
            { child_name_p1: { field_id: "field_1" }, child_name_p2: { field_id: "field_1" } },
            [widget("child_name_p1", 1), widget("child_name_p2", 2)],
        );

        expect(regions).toHaveLength(2);
        expect(new Set(regions.map((r) => r.field_id))).toEqual(new Set(["field_1"]));
    });

    it("skips a widget with no rectangle — it cannot be drawn, so it cannot be selected", () => {
        const { regions } = buildPaperworkRegions({ child_first_name: { field_id: "field_1" } }, [
            { name: "child_first_name", page: 1, bbox: null },
        ]);

        expect(regions).toEqual([]);
    });

    it("reports a mapped widget the document does not contain, because that fact will never print", () => {
        const { regions, missingFromDocument } = buildPaperworkRegions(
            { child_first_name: { field_id: "field_1" }, guardian_mobile: { field_id: "field_9" } },
            [widget("child_first_name")],
        );

        expect(regions).toHaveLength(1);
        expect(missingFromDocument).toEqual(["guardian_mobile"]);
    });

    it("reports nothing missing when every mapped widget is on the page", () => {
        const { missingFromDocument } = buildPaperworkRegions({ child_first_name: { field_id: "field_1" } }, [
            widget("child_first_name"),
        ]);

        expect(missingFromDocument).toEqual([]);
    });

    it("returns no regions for a document that shares no names with the mapping", () => {
        // The route reads this as "not this version's document" and falls back to another version
        // rather than showing a page nobody can click.
        const { regions } = buildPaperworkRegions({ child_first_name: { field_id: "field_1" } }, [
            widget("totally_different_form_field"),
        ]);

        expect(regions).toEqual([]);
    });
});
