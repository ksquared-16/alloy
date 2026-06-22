import { describe, expect, it } from "vitest";

import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    applySectionRowLayout,
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

    it("applies two_thirds_third width spans", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = applySectionRowLayout(doc, "children_enrollment", "two_thirds_third");
        const enrollment = doc.sections.find((s) => s.key === "children_enrollment")!;
        const household = doc.sections.find((s) => s.key === "household_contact")!;
        expect(enrollment.metadata?.layoutEditorSectionRowSpan).toBe(8);
        expect(household.metadata?.layoutEditorSectionRowSpan).toBe(4);
    });
});
