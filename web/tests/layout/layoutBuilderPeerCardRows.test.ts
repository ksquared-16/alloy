/**
 * Sprint 5.18C — peer card row packing and experience builder stabilization tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { LAYOUT_EDITOR_KPI_TILE_METADATA_KEY } from "@/lib/layout/layoutBuilderKpiTileRows";
import {
    applyPeerCardWidth,
    packPeerCardsInZone,
    sectionIsPackablePeerCard,
} from "@/lib/layout/layoutBuilderPeerCardRows";
import { readSectionRowGroup, readSectionRowSpan, segmentSectionsForRowLayout } from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";
import { shouldShowLayoutBuilderStartGuide } from "@/lib/layout/layoutBuilderStudioUx";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { ensureOpportunityDrawerLayoutDocSaveReady } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function addPeerCard(
    doc: LayoutDoc,
    input: Parameters<typeof createExperienceBuilderCard>[1],
) {
    return createExperienceBuilderCard(doc, input);
}

function mainZonePackableSections(doc: LayoutDoc) {
    return doc.sections.filter(
        (section) =>
            resolveOpportunityDrawerSectionZone(section) === "main" && sectionIsPackablePeerCard(section),
    );
}

function expectPackedOnOneRow(sections: ReturnType<typeof mainZonePackableSections>) {
    expect(sections.length).toBeGreaterThan(1);
    const groupId = readSectionRowGroup(sections[0]!);
    expect(groupId).toBeTruthy();
    for (const section of sections) {
        expect(readSectionRowGroup(section)).toBe(groupId);
    }
}

describe("layoutBuilderPeerCardRows", () => {
    it("layoutEditorKpiTile passes surface validation on save-ready doc", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        }).doc;

        const tile = doc.sections.find((s) => s.metadata?.[LAYOUT_EDITOR_KPI_TILE_METADATA_KEY] === true)!;
        expect(tile).toBeTruthy();

        const saveReady = ensureOpportunityDrawerLayoutDocSaveReady(doc);
        const parsed = parseLayoutDoc(saveReady.doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);

        const surface = validateLayoutDocForSurface(saveReady.doc, "opportunity_drawer");
        expect(surface.errors.some((e) => e.includes("layoutEditorKpiTile"))).toBe(false);
        expect(surface.ok, surface.errors.join("; ")).toBe(true);
    });

    it("adding one KPI tile creates exactly one new section", () => {
        const before = buildLeadDrawerDefaultDoc();
        const beforeCount = before.sections.length;
        const result = addPeerCard(before, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        });
        expect(result.doc.sections).toHaveLength(beforeCount + 1);
        expect(result.doc.sections.filter((s) => sectionIsKpiTile(s))).toHaveLength(1);
    });

    it("packs KPI tiles 1/3 + 1/3 + 1/3 on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "A", widthKey: "third", cardType: "widget", widgetKey: "tasks" }).doc;
        doc = addPeerCard(doc, { title: "B", widthKey: "third", cardType: "widget", widgetKey: "tasks" }).doc;
        doc = addPeerCard(doc, { title: "C", widthKey: "third", cardType: "widget", widgetKey: "tasks" }).doc;

        const tiles = doc.sections.filter((s) => sectionIsKpiTile(s));
        expectPackedOnOneRow(tiles);
    });

    it("packs fields card 1/3 + fields card 2/3 on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "A", widthKey: "third", cardType: "fields" }).doc;
        doc = addPeerCard(doc, { title: "B", widthKey: "two_thirds", cardType: "fields" }).doc;

        const cards = mainZonePackableSections(doc);
        expect(cards).toHaveLength(2);
        expectPackedOnOneRow(cards);
        expect(cards.map((s) => readSectionRowSpan(s))).toEqual([4, 8]);
    });

    it("packs related list 1/4 + text block 1/4 + fields 1/2 on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "List", widthKey: "quarter", cardType: "related_list" }).doc;
        doc = addPeerCard(doc, { title: "Notes", widthKey: "quarter", cardType: "text" }).doc;
        doc = addPeerCard(doc, { title: "Fields", widthKey: "half", cardType: "fields" }).doc;

        const cards = mainZonePackableSections(doc);
        expect(cards).toHaveLength(3);
        expectPackedOnOneRow(cards);
    });

    it("full width card forces new row separate from fractional neighbor", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "Half", widthKey: "half", cardType: "fields" }).doc;
        const halfKey = doc.sections[doc.sections.length - 1]!.key;
        doc = addPeerCard(doc, { title: "Full", widthKey: "full", cardType: "fields" }).doc;
        const fullKey = doc.sections[doc.sections.length - 1]!.key;

        const full = doc.sections.find((s) => s.key === fullKey)!;
        const half = doc.sections.find((s) => s.key === halfKey)!;
        expect(readSectionRowGroup(full)).toBeNull();
        expect(readSectionRowSpan(full)).toBe(12);
        expect(readSectionRowGroup(half)).not.toBe(readSectionRowGroup(full));
    });

    it("segmentSectionsForRowLayout reflects packed peer cards", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "A", widthKey: "third", cardType: "fields" }).doc;
        doc = addPeerCard(doc, { title: "B", widthKey: "two_thirds", cardType: "fields" }).doc;
        const cards = mainZonePackableSections(doc);
        const segments = segmentSectionsForRowLayout(cards);
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("row");
    });

    it("packPeerCardsInZone is stable for repeated calls", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addPeerCard(doc, { title: "A", widthKey: "third", cardType: "fields" }).doc;
        doc = addPeerCard(doc, { title: "B", widthKey: "third", cardType: "fields" }).doc;
        const once = packPeerCardsInZone(doc, "main");
        const twice = packPeerCardsInZone(once, "main");
        expect(mainZonePackableSections(twice).map((s) => readSectionRowSpan(s))).toEqual(
            mainZonePackableSections(once).map((s) => readSectionRowSpan(s)),
        );
    });
});

describe("layoutBuilderStudioUx start guide", () => {
    it("does not show start guide over existing default layouts", () => {
        expect(shouldShowLayoutBuilderStartGuide(buildLeadDrawerDefaultDoc())).toBe(false);
    });
});
