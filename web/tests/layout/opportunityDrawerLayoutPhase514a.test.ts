/**
 * Visual Layout Configuration Builder — Phase 5.14A composition enhancements.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionWidgetItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
    applySectionRowLayout,
    deleteOpportunityDrawerSection,
    readSectionRowGroup,
    readSectionRowSpan,
    readSectionType,
    segmentSectionsForRowLayout,
    setSectionType,
    validateSectionLayoutMetadata,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";

describe("section row groups", () => {
    it("groups adjacent sections in the same zone with width presets", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { zone: "main", title: "A" });
        doc = addCustomOpportunityDrawerSection(doc, { zone: "main", title: "B" });
        const keyA = doc.sections.find((s) => s.title === "A")!.key;
        const keyB = doc.sections.find((s) => s.title === "B")!.key;

        doc = applySectionRowLayout(doc, keyA, "50_50");
        expect(readSectionRowGroup(doc.sections.find((s) => s.key === keyA)!)).toBeTruthy();
        expect(readSectionRowGroup(doc.sections.find((s) => s.key === keyB)!)).toBe(
            readSectionRowGroup(doc.sections.find((s) => s.key === keyA)!),
        );
        expect(readSectionRowSpan(doc.sections.find((s) => s.key === keyA)!)).toBe(6);
        expect(readSectionRowSpan(doc.sections.find((s) => s.key === keyB)!)).toBe(6);

        const segments = segmentSectionsForRowLayout(
            doc.sections.filter((s) => s.key === keyA || s.key === keyB),
        );
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("row");
    });

    it("clears row group on full width preset", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { zone: "main", title: "A" });
        doc = addCustomOpportunityDrawerSection(doc, { zone: "main", title: "B" });
        const keyA = doc.sections.find((s) => s.title === "A")!.key;
        doc = applySectionRowLayout(doc, keyA, "50_50");
        doc = applySectionRowLayout(doc, keyA, "full_width");
        expect(readSectionRowGroup(doc.sections.find((s) => s.key === keyA)!)).toBeNull();
    });
});

describe("section types", () => {
    it("creates widget section with metadata type", () => {
        const doc = addWidgetOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "KPI strip" });
        const section = doc.sections[doc.sections.length - 1]!;
        expect(readSectionType(section)).toBe("widget");
    });

    it("validates widget section requires a widget item", () => {
        const doc = addWidgetOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        expect(validateSectionLayoutMetadata(doc).some((e) => e.includes("widget sections must contain"))).toBe(true);

        let withWidget = addSectionWidgetItem(doc, sectionKey, 0, 0, "tour_summary");
        expect(withWidget.ok).toBe(true);
        if (withWidget.ok) {
            expect(validateSectionLayoutMetadata(withWidget.doc)).toHaveLength(0);
        }
    });

    it("creates related list section and syncs children item", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Children list" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        expect(readSectionType(doc.sections.find((s) => s.key === sectionKey)!)).toBe("related_list");

        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, {
            primaryRow: { fields: ["child.name", "child.dob_age"] },
            secondaryRow: { fields: ["child.program", "child.room"] },
        });
        const config = readLayoutEditorRelatedListConfig(doc.sections.find((s) => s.key === sectionKey)!);
        expect(config.primaryRow.fields).toEqual(["child.name", "child.dob_age"]);

        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const item = doc.sections.find((s) => s.key === sectionKey)!.rows[0]?.columns[0]?.items[0];
        expect(item?.kind).toBe("related_list");
        expect(item?.refKey).toBe("children");
        expect(item?.columns?.map((c) => c.refKey)).toEqual(
            expect.arrayContaining(["child.name", "child.dob_age", "child.program", "child.room"]),
        );

        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    });
});

describe("delete section", () => {
    it("removes custom section and rebalances row group", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { zone: "main", title: "A" });
        doc = addCustomOpportunityDrawerSection(doc, { zone: "main", title: "B" });
        doc = addCustomOpportunityDrawerSection(doc, { zone: "main", title: "C" });
        const keyA = doc.sections.find((s) => s.title === "A")!.key;
        const keyB = doc.sections.find((s) => s.title === "B")!.key;
        doc = applySectionRowLayout(doc, keyA, "equal_3");
        doc = deleteOpportunityDrawerSection(doc, keyB);
        expect(doc.sections.some((s) => s.title === "B")).toBe(false);
        const remaining = doc.sections.filter((s) => readSectionRowGroup(s) === readSectionRowGroup(doc.sections.find((s) => s.key === keyA)!));
        expect(remaining.length).toBe(2);
    });

    it("passes surface validation after delete", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const key = doc.sections[doc.sections.length - 1]!.key;
        doc = deleteOpportunityDrawerSection(doc, key);
        const validated = validateOpportunityDrawerLayoutDoc(doc);
        expect(validated.ok, validated.errors.join("; ")).toBe(true);
    });
});

describe("section type metadata", () => {
    it("accepts layoutEditor section metadata keys on surface validate", () => {
        let doc = addCustomOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const key = doc.sections[doc.sections.length - 1]!.key;
        doc = setSectionType(doc, key, "content");
        doc = applySectionRowLayout(doc, key, "full_width");
        const validated = validateOpportunityDrawerLayoutDoc(doc);
        expect(validated.ok, validated.errors.join("; ")).toBe(true);
    });
});
