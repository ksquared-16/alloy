/**
 * Experience Builder runtime parity — Sprint 5.17B tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    collectLayoutEditorDisplayPublishGuardErrors,
    formatLayoutEditorFieldDateValue,
    shouldShowLayoutEditorFieldLabel,
} from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import {
    patchLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { addRelatedListOpportunityDrawerSection } from "@/lib/layout/layoutEditorSectionLayout";
import { validateOpportunityDrawerLayoutPublishGuards } from "@/lib/layout/layoutEditorPublishGuards";
import {
    readLayoutEditorRelatedListConfigFromItem,
    relatedListPresentationToDisplayMode,
    resolveRelatedListPresentationMode,
} from "@/lib/layout/runtime/resolveLayoutRuntimeRelatedListPresentation";
import {
    resolveLayoutEditorWidgetRuntimeTone,
    resolveLayoutEditorWidgetToneRailClass,
} from "@/lib/layout/layoutEditorWidgetStyle";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";

describe("related list presentation runtime", () => {
    it("syncs presentation mode onto related_list item metadata", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Children list" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, { presentationMode: "cards" });
        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const item = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        expect(item.displayMode).toBe("rows");
        expect(resolveRelatedListPresentationMode(item)).toBe("cards");
        expect(readLayoutEditorRelatedListConfigFromItem(item)?.presentationMode).toBe("cards");
    });

    it("maps presentation modes to layout display modes", () => {
        expect(relatedListPresentationToDisplayMode("table")).toBe("table");
        expect(relatedListPresentationToDisplayMode("cards")).toBe("rows");
        expect(relatedListPresentationToDisplayMode("compact")).toBe("list");
    });
});

describe("widget tone runtime mapping", () => {
    it("resolves configured tones without collapsing blue and purple", () => {
        expect(resolveLayoutEditorWidgetRuntimeTone({ tone: "blue" })).toBe("blue");
        expect(resolveLayoutEditorWidgetRuntimeTone({ tone: "purple" })).toBe("purple");
        expect(resolveLayoutEditorWidgetRuntimeTone({ tone: "red" })).toBe("red");
        expect(resolveLayoutEditorWidgetToneRailClass("blue")).toContain("alloy-blue");
        expect(resolveLayoutEditorWidgetToneRailClass("purple")).toContain("violet");
    });

    it("maps legacy work/attention aliases", () => {
        expect(resolveLayoutEditorWidgetRuntimeTone({ tone: "work" })).toBe("green");
        expect(resolveLayoutEditorWidgetRuntimeTone({ tone: "attention" })).toBe("amber");
    });
});

describe("field display runtime helpers", () => {
    it("hides labels when configured", () => {
        expect(shouldShowLayoutEditorFieldLabel({ showLabel: false })).toBe(false);
        expect(shouldShowLayoutEditorFieldLabel({ labelPosition: "hidden" })).toBe(false);
        expect(shouldShowLayoutEditorFieldLabel({ showLabel: true, labelPosition: "above" })).toBe(true);
    });

    it("formats date values using editor date format", () => {
        const formatted = formatLayoutEditorFieldDateValue(
            "child.start_date",
            "2024-06-15",
            "date",
            "medium",
        );
        expect(formatted).toMatch(/Jun/i);
        expect(formatted).toMatch(/2024/);
    });
});

describe("publish guards for unsupported behavior", () => {
    it("blocks open modal and external URL link behaviors", () => {
        const errors = collectLayoutEditorDisplayPublishGuardErrors(
            { linkBehavior: "open_modal" },
            'Section "custom" field "Phone"',
        );
        expect(errors.some((e) => e.includes("Open modal"))).toBe(true);

        const external = collectLayoutEditorDisplayPublishGuardErrors(
            { linkBehavior: "external_url", externalUrl: "https://example.com" },
            "field",
        );
        expect(external.some((e) => e.includes("external URL"))).toBe(true);
    });

    it("blocks currency formatting and preview-only layout positions", () => {
        const errors = collectLayoutEditorDisplayPublishGuardErrors(
            { currencyFormat: "standard", labelPosition: "inline", iconPosition: "above" },
            "field",
        );
        expect(errors.length).toBeGreaterThanOrEqual(3);
    });

    it("blocks publish when layout contains unsupported field display config", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const sectionKey = "lead_source";
        const fieldItem = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        doc = patchLayoutEditorFieldDisplay(
            doc,
            { kind: "field", sectionKey, itemId: fieldItem.id },
            { linkBehavior: "open_modal" },
        );
        const guardErrors = validateOpportunityDrawerLayoutPublishGuards(doc);
        expect(guardErrors.some((e) => e.includes("Open modal"))).toBe(true);
    });

    it("allows supported open drawer link behavior", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const sectionKey = "lead_source";
        const fieldItem = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        doc = patchLayoutEditorFieldDisplay(
            doc,
            { kind: "field", sectionKey, itemId: fieldItem.id },
            { linkBehavior: "open_drawer" },
        );
        const updated = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        const display = readLayoutEditorDisplayConfig(updated);
        expect(display.linkBehavior).toBe("open_drawer");
        expect(collectLayoutEditorDisplayPublishGuardErrors(display, "field")).toEqual([]);
    });
});
