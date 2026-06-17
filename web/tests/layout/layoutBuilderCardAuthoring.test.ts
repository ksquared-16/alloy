/**
 * Experience Builder card authoring — Sprint 5.18 / 5.18A tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { readCardWidthFraction } from "@/lib/layout/layoutBuilderCardWidth";
import { listSectionWidgetItems, sectionIsKpiTile, sectionIsWidgetStrip } from "@/lib/layout/layoutBuilderWidgetStrip";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";

describe("layoutBuilderCardAuthoring", () => {
    it("creates a fields card with operator width", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Enrollment Details",
            widthKey: "half",
            cardType: "fields",
        });
        const section = result.doc.sections.find((s) => s.key === result.sectionKey);
        expect(section?.title).toBe("Enrollment Details");
        expect(readSectionType(section!)).toBe("content");
        expect(readCardWidthFraction(section!)).toBe("half");
    });

    it("creates a standalone KPI tile without card wrapper title", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        });
        const section = result.doc.sections.find((s) => s.key === result.sectionKey);
        expect(section?.title).toBe("");
        expect(readSectionType(section!)).toBe("widget");
        expect(sectionIsKpiTile(section!)).toBe(true);
        expect(sectionIsWidgetStrip(section!)).toBe(false);
        expect(readCardWidthFraction(section!)).toBe("third");
        expect(result.itemId).toBeTruthy();

        const widgets = listSectionWidgetItems(result.doc, result.sectionKey);
        expect(widgets[0]?.title).toBe("Open Tasks");
    });
});
