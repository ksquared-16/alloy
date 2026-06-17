/**
 * Experience Builder card authoring — Sprint 5.18 tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { readCardWidthFraction } from "@/lib/layout/layoutBuilderCardWidth";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import { sectionIsWidgetStrip } from "@/lib/layout/layoutBuilderWidgetStrip";

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

    it("creates a standalone KPI tile card", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Open Tasks",
            widthKey: "quarter",
            cardType: "widget",
            widgetKey: "tasks",
        });
        const section = result.doc.sections.find((s) => s.key === result.sectionKey);
        expect(section?.title).toBe("Open Tasks");
        expect(readSectionType(section!)).toBe("widget");
        expect(sectionIsWidgetStrip(section!)).toBe(false);
        expect(result.itemId).toBeTruthy();
    });
});
