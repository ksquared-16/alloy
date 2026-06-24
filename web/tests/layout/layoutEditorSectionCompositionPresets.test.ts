import { describe, expect, it } from "vitest";

import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    applySectionRowLayout,
    applySectionRowLayoutWithResult,
    readSectionRowLayoutPresetApplyState,
    readSectionRowStackRole,
    segmentSectionsForRowLayout,
    SECTION_ROW_WIDTH_PRESETS,
} from "@/lib/layout/layoutEditorSectionLayout";

describe("section composition presets (EB-FW-02)", () => {
    it("exposes third/two-thirds and stacked presets", () => {
        expect(SECTION_ROW_WIDTH_PRESETS.third_two_thirds.spans).toEqual([4, 8]);
        expect(SECTION_ROW_WIDTH_PRESETS.two_thirds_third.spans).toEqual([8, 4]);
        expect(SECTION_ROW_WIDTH_PRESETS.stacked_right_2x2.stackLayout).toBe("stacked_right");
        expect(SECTION_ROW_WIDTH_PRESETS.stacked_left_2x2.stackLayout).toBe("stacked_left");
    });

    it("segments stacked_right_2x2 groups into primary + stacked cells", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const zoneKeys = ["children_enrollment", "household_contact", "lead_source"];

        doc = applySectionRowLayout(doc, zoneKeys[0]!, "stacked_right_2x2");
        const grouped = doc.sections.filter((s) => zoneKeys.includes(s.key));
        expect(readSectionRowStackRole(grouped[0]!)).toBe("primary");
        expect(readSectionRowStackRole(grouped[1]!)).toBe("stack");
        expect(readSectionRowStackRole(grouped[2]!)).toBe("stack");

        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("stacked_row");
        if (segments[0]?.kind === "stacked_row") {
            expect(segments[0].layout).toBe("stacked_right");
            expect(segments[0].primary.key).toBe(zoneKeys[0]);
            expect(segments[0].stacked.map((s) => s.key)).toEqual([zoneKeys[1], zoneKeys[2]]);
        }
    });

    it("segments stacked_left_2x2 with primary on the right", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const zoneKeys = ["children_enrollment", "household_contact", "lead_source"];
        doc = applySectionRowLayout(doc, zoneKeys[0]!, "stacked_left_2x2");
        const grouped = doc.sections.filter((s) => zoneKeys.includes(s.key));
        expect(readSectionRowStackRole(grouped[2]!)).toBe("primary");

        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments[0]?.kind).toBe("stacked_row");
        if (segments[0]?.kind === "stacked_row") {
            expect(segments[0].layout).toBe("stacked_left");
            expect(segments[0].primary.key).toBe(zoneKeys[2]);
        }
    });

    it("exposes half + stacked right and stacked left + half presets", () => {
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_right.stackLayout).toBe("stacked_right_equal");
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_right.spans).toEqual([6, 6, 6]);
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_left.stackLayout).toBe("stacked_left_equal");
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_left.spans).toEqual([6, 6, 6]);
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_right.label).toMatch(/left full · right stacked/i);
        expect(SECTION_ROW_WIDTH_PRESETS.half_stacked_left.label).toMatch(/left stacked · right full/i);
    });

    it("segments half_stacked_right: one half-width primary + two stacked on the right", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const zoneKeys = ["children_enrollment", "household_contact", "lead_source"];
        doc = applySectionRowLayout(doc, zoneKeys[0]!, "half_stacked_right");
        const grouped = doc.sections.filter((s) => zoneKeys.includes(s.key));
        expect(readSectionRowStackRole(grouped[0]!)).toBe("primary");
        expect(readSectionRowStackRole(grouped[1]!)).toBe("stack");
        expect(readSectionRowStackRole(grouped[2]!)).toBe("stack");

        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("stacked_row");
        if (segments[0]?.kind === "stacked_row") {
            expect(segments[0].layout).toBe("stacked_right_equal");
            expect(segments[0].primary.key).toBe(zoneKeys[0]);
            expect(segments[0].stacked.map((s) => s.key)).toEqual([zoneKeys[1], zoneKeys[2]]);
        }
    });

    it("segments half_stacked_left: two stacked on the left + half-width primary on the right", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const zoneKeys = ["children_enrollment", "household_contact", "lead_source"];
        doc = applySectionRowLayout(doc, zoneKeys[0]!, "half_stacked_left");
        const grouped = doc.sections.filter((s) => zoneKeys.includes(s.key));
        expect(readSectionRowStackRole(grouped[2]!)).toBe("primary");

        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments[0]?.kind).toBe("stacked_row");
        if (segments[0]?.kind === "stacked_row") {
            expect(segments[0].layout).toBe("stacked_left_equal");
            expect(segments[0].primary.key).toBe(zoneKeys[2]);
            expect(segments[0].stacked.map((s) => s.key)).toEqual([zoneKeys[0], zoneKeys[1]]);
        }
    });

    it("applies two_thirds_third width spans", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = applySectionRowLayout(doc, "children_enrollment", "two_thirds_third");
        const enrollment = doc.sections.find((s) => s.key === "children_enrollment")!;
        const household = doc.sections.find((s) => s.key === "household_contact")!;
        expect(enrollment.metadata?.layoutEditorSectionRowSpan).toBe(8);
        expect(household.metadata?.layoutEditorSectionRowSpan).toBe(4);
    });

    it("reports when stacked row preset cannot apply (not enough following sections)", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const state = readSectionRowLayoutPresetApplyState(doc, "household_contact", "half_stacked_right");
        expect(state.canApply).toBe(false);
        expect(state.reason).toMatch(/more card/i);

        const result = applySectionRowLayoutWithResult(doc, "household_contact", "half_stacked_right");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/more card/i);
    });

    it("applySectionRowLayoutWithResult writes stack role metadata for half_stacked_right", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const zoneKeys = ["children_enrollment", "household_contact", "lead_source"];
        const result = applySectionRowLayoutWithResult(doc, zoneKeys[0]!, "half_stacked_right");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        doc = result.doc;
        const grouped = doc.sections.filter((s) => zoneKeys.includes(s.key));
        expect(readSectionRowStackRole(grouped[0]!)).toBe("primary");
        expect(readSectionRowStackRole(grouped[1]!)).toBe("stack");
        expect(readSectionRowStackRole(grouped[2]!)).toBe("stack");
        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments[0]?.kind).toBe("stacked_row");
    });
});
