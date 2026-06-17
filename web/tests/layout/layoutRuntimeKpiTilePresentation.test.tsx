/**
 * Sprint 5.18B — KPI tile runtime presentation parity tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerLayoutRuntimeShellZoneView from "@/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import {
    sectionIsKpiTile,
    sectionIsWidgetStrip,
    sectionUsesKpiTileRuntimePresentation,
} from "@/lib/layout/runtime/layoutRuntimeKpiTilePresentation";
import { segmentSectionsForRowLayout } from "@/lib/layout/layoutEditorSectionLayout";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { leadOverviewCompositionHints } from "@/lib/layout/runtime/leadOverviewComposition";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { setSectionEditorHidden } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { buildOpportunityDrawerRuntimeSectionVisibilityContext } from "@/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function addKpiTile(doc: LayoutDoc, title: string, zone: "summary_strip" | "right_rail" = "summary_strip") {
    return createExperienceBuilderCard(doc, {
        title,
        widthKey: "third",
        cardType: "widget",
        widgetKey: "tasks",
        zone,
    }).doc;
}

function summaryStripKpiTiles(doc: LayoutDoc) {
    return doc.sections.filter(
        (section) =>
            sectionIsKpiTile(section) && resolveOpportunityDrawerSectionZone(section) === "summary_strip",
    );
}

describe("layoutRuntimeKpiTilePresentation", () => {
    it("identifies layoutEditorKpiTile sections", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "Open Tasks");
        const tile = summaryStripKpiTiles(doc)[0]!;
        expect(tile.metadata?.layoutEditorKpiTile).toBe(true);
        expect(sectionUsesKpiTileRuntimePresentation(tile)).toBe(true);
        expect(sectionIsWidgetStrip(tile)).toBe(false);
    });

    it("omits drawer overview panel chrome for KPI tiles in summary strip", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "Open Tasks");
        const tiles = summaryStripKpiTiles(doc);
        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        expect(split.summarySectionKeys).toEqual(expect.arrayContaining(tiles.map((t) => t.key)));

        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={{ ...doc, sections: split.summaryDoc.sections.filter((s) => sectionIsKpiTile(s)) }}
                record={LAYOUT_DRAWER_PREVIEW_RECORD}
                entityId="opp-preview"
            />,
        );

        expect(html).toContain('data-layout-runtime-kpi-tile="true"');
        expect(html).toContain('data-lead-operating-summary-card="true"');
        expect(html).toContain("Open Tasks");
        expect(html).not.toContain('data-drawer-overview-panel="true"');
    });

    it("row-packs three 1/3 KPI tiles on one runtime row", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addKpiTile(doc, "Open Tasks");
        doc = addKpiTile(doc, "Follow Ups");
        doc = addKpiTile(doc, "Tours");
        const tiles = summaryStripKpiTiles(doc);
        expect(tiles).toHaveLength(3);

        const segments = segmentSectionsForRowLayout(tiles);
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("row");

        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={{ ...doc, sections: split.summaryDoc.sections.filter((s) => sectionIsKpiTile(s)) }}
                record={LAYOUT_DRAWER_PREVIEW_RECORD}
                entityId="opp-preview"
            />,
        );
        expect(html).toContain('data-layout-section-segment="row"');
        expect(html).toContain("Open Tasks");
        expect(html).toContain("Follow Ups");
        expect(html).toContain("Tours");
    });

    it("renders legacy multi-widget KPI strip without kpi-tile section markers", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const leadSummary = doc.sections.find((s) => s.key === "lead_summary")!;
        expect(sectionIsWidgetStrip(leadSummary)).toBe(true);
        expect(sectionIsKpiTile(leadSummary)).toBe(false);

        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={split.summaryDoc}
                record={LAYOUT_DRAWER_PREVIEW_RECORD}
                entityId="opp-preview"
            />,
        );

        expect(html).not.toContain('data-layout-runtime-kpi-tile="true"');
        expect(html).toContain("Attention");
        expect(html).toContain("Tour / Event");
    });

    it("omits hidden KPI tiles when visual config adoption is on", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const created = createExperienceBuilderCard(doc, {
            title: "Hidden Tile",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "attention",
        });
        doc = setSectionEditorHidden(created.doc, created.sectionKey, true);
        const tile = doc.sections.find((s) => s.key === created.sectionKey)!;
        const record = buildProofOpportunityRecord();
        const ctx = buildOpportunityDrawerRuntimeSectionVisibilityContext(
            { sectionPresentation: "summary_strip" },
            { adoptionEnabled: true },
        );
        expect(shouldRenderLayoutRuntimeSection(tile, record, ctx)).toBe(false);
    });

    it("renders KPI tiles in right rail without section panel chrome", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = createExperienceBuilderCard(doc, {
            title: "Rail Metric",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "attention",
            zone: "right_rail",
        }).doc;
        const tile = doc.sections.find((s) => sectionIsKpiTile(s) && resolveOpportunityDrawerSectionZone(s) === "right_rail")!;

        const html = renderToStaticMarkup(
            <LayoutRuntimeCompositionProvider value={leadOverviewCompositionHints()}>
                <LayoutRuntimeSectionFlowView
                    doc={doc}
                    sections={[tile]}
                    record={LAYOUT_DRAWER_PREVIEW_RECORD}
                    entityId="opp-preview"
                />
            </LayoutRuntimeCompositionProvider>,
        );

        expect(html).toContain('data-layout-runtime-kpi-tile="true"');
        expect(html).toContain("Rail Metric");
        expect(html).not.toContain('data-drawer-overview-panel="true"');
    });
});
