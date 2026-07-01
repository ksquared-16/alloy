/**
 * Canvas overflow — zone-placed sections must not render twice.
 */

import { describe, expect, it } from "vitest";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { partitionLeadOverviewBodySections } from "@/lib/layout/runtime/leadOverviewComposition";
import { partitionOpportunityDrawerSectionsByZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";

function overflowSectionKeys(doc: ReturnType<typeof buildLeadDrawerDefaultDoc>) {
    const slots = partitionLeadOverviewBodySections(doc);
    const zones = partitionOpportunityDrawerSectionsByZone(doc);
    const renderedInZones = new Set([
        ...zones.summary_strip.map((section) => section.key),
        ...zones.right_rail.map((section) => section.key),
        ...zones.footer_actions.map((section) => section.key),
    ]);
    return slots.overflow
        .filter((section) => !renderedInZones.has(section.key))
        .map((section) => section.key);
}

describe("experience builder canvas overflow dedupe", () => {
    it("adding one KPI tile does not duplicate in overflow", () => {
        const before = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(before, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        });
        const kpiTiles = result.doc.sections.filter((s) => sectionIsKpiTile(s));
        expect(kpiTiles).toHaveLength(1);

        const zones = partitionOpportunityDrawerSectionsByZone(result.doc);
        expect(zones.summary_strip.filter((s) => s.key === result.sectionKey)).toHaveLength(1);
        expect(overflowSectionKeys(result.doc).filter((key) => key === result.sectionKey)).toHaveLength(0);
    });
});
