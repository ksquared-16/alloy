/**
 * Experience Builder — KPI tile row packing (Sprint 5.18A).
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { applyKpiTileWidth, packKpiTilesInZone } from "@/lib/layout/layoutBuilderKpiTileRows";
import { readSectionRowGroup, readSectionRowSpan } from "@/lib/layout/layoutEditorSectionLayout";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function addKpiTile(doc: LayoutDoc, title: string, widthKey: "quarter" | "third" | "half" | "three_quarter" | "two_thirds" | "full") {
    return createExperienceBuilderCard(doc, {
        title,
        widthKey,
        cardType: "widget",
        widgetKey: "tasks",
    }).doc;
}

function summaryStripKpiTiles(doc: LayoutDoc) {
    return doc.sections.filter(
        (section) =>
            sectionIsKpiTile(section) && resolveOpportunityDrawerSectionZone(section) === "summary_strip",
    );
}

function expectPackedOnOneRow(sections: ReturnType<typeof summaryStripKpiTiles>) {
    expect(sections.length).toBeGreaterThan(1);
    const groupId = readSectionRowGroup(sections[0]!);
    expect(groupId).toBeTruthy();
    for (const section of sections) {
        expect(readSectionRowGroup(section)).toBe(groupId);
    }
    const totalSpan = sections.reduce((sum, section) => sum + readSectionRowSpan(section), 0);
    expect(totalSpan).toBeLessThanOrEqual(12);
}

describe("layoutBuilderKpiTileRows", () => {
    it("packs three 1/3 tiles on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "Open Tasks", "third");
        doc = addKpiTile(doc, "Follow Ups", "third");
        doc = addKpiTile(doc, "Tours", "third");

        const tiles = summaryStripKpiTiles(doc);
        expect(tiles).toHaveLength(3);
        expectPackedOnOneRow(tiles);
        expect(tiles.map((s) => readSectionRowSpan(s))).toEqual([4, 4, 4]);
    });

    it("packs two 1/2 tiles on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "A", "half");
        doc = addKpiTile(doc, "B", "half");

        const tiles = summaryStripKpiTiles(doc);
        expect(tiles).toHaveLength(2);
        expectPackedOnOneRow(tiles);
    });

    it("packs 1/2 + 1/4 + 1/4 on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "A", "half");
        doc = addKpiTile(doc, "B", "quarter");
        doc = addKpiTile(doc, "C", "quarter");

        const tiles = summaryStripKpiTiles(doc);
        expect(tiles).toHaveLength(3);
        expectPackedOnOneRow(tiles);
        expect(tiles.map((s) => readSectionRowSpan(s))).toEqual([6, 3, 3]);
    });

    it("packs 3/4 + 1/4 on one row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "A", "three_quarter");
        doc = addKpiTile(doc, "B", "quarter");

        const tiles = summaryStripKpiTiles(doc);
        expect(tiles).toHaveLength(2);
        expectPackedOnOneRow(tiles);
        expect(tiles.map((s) => readSectionRowSpan(s))).toEqual([9, 3]);
    });

    it("repacks when width changes break a row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "A", "third");
        doc = addKpiTile(doc, "B", "third");
        const tilesBefore = summaryStripKpiTiles(doc);
        expectPackedOnOneRow(tilesBefore);

        const secondKey = tilesBefore[1]!.key;
        doc = applyKpiTileWidth(doc, secondKey, "full");

        const second = doc.sections.find((s) => s.key === secondKey)!;
        expect(readSectionRowGroup(second)).toBeNull();
        expect(readSectionRowSpan(second)).toBe(12);
    });

    it("packKpiTilesInZone preserves row structure on repeat", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "A", "third");
        doc = addKpiTile(doc, "B", "third");
        doc = addKpiTile(doc, "C", "third");

        const packedOnce = packKpiTilesInZone(doc, "summary_strip");
        const packedTwice = packKpiTilesInZone(packedOnce, "summary_strip");

        const tilesOnce = summaryStripKpiTiles(packedOnce);
        const tilesTwice = summaryStripKpiTiles(packedTwice);
        expectPackedOnOneRow(tilesTwice);
        expect(tilesTwice.map((s) => readSectionRowSpan(s))).toEqual(tilesOnce.map((s) => readSectionRowSpan(s)));
    });
});
