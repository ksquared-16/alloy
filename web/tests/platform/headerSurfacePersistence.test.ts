import { describe, expect, it } from "vitest";

import {
    headerViewsToDoc,
    headerDocToDesired,
    diffHeaderPlacements,
    headerContextConfig,
    HEADER_ZONE_BY_SURFACE,
    isHeaderSurface,
    type HeaderPlacementView,
} from "@/lib/metrics/platform/headerSurfacePersistence";
import { IMPLICIT_SECTION_ID } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const views: HeaderPlacementView[] = [
    { id: "h1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 10, accent: "amber" },
    { id: "h2", sourceKey: "ops.needs_attention_count", vizType: "kpi_card", label: "Attn", sortOrder: 0, size: "wide" },
];

describe("Header placement ⇄ SurfaceDoc mapping", () => {
    it("writes each header to the zone the runtime reads", () => {
        expect(HEADER_ZONE_BY_SURFACE.workspace_header).toBe("primary_metrics");
        expect(HEADER_ZONE_BY_SURFACE.work_unit_header).toBe("header_metrics");
        expect(isHeaderSurface("workspace_header")).toBe(true);
        expect(isHeaderSurface("operational_intelligence")).toBe(false);
    });

    it("builds a single-section doc, sorted, with size/accent carried in config", () => {
        const doc = headerViewsToDoc(views);
        expect(doc.sections).toHaveLength(1);
        expect(doc.sections[0].sectionId).toBe(IMPLICIT_SECTION_ID);
        expect(doc.sections[0].cards.map((c) => c.instanceId)).toEqual(["h2", "h1"]); // sortOrder 0 before 10
        expect(doc.sections[0].cards[0].config).toMatchObject({ rendererKey: "kpi_card", size: "wide" });
        expect(doc.sections[0].cards[1].config).toMatchObject({ accent: "amber" });
    });

    it("flattens a doc into desired placements, carrying size/accent, deduping by metric", () => {
        const doc: SurfaceDoc = {
            sections: [
                {
                    sectionId: IMPLICIT_SECTION_ID,
                    title: "",
                    cards: [
                        { instanceId: "a", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: { rendererKey: "kpi_card", accent: "blue" } },
                        { instanceId: "b", cardTypeKey: "trend", contentId: "enrollment.tour_conversion_rate", config: { rendererKey: "trend_card", size: "standard" } },
                        { instanceId: "c", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: {} }, // dup → skipped
                        { instanceId: "d", cardTypeKey: "kpi", contentId: null, config: {} }, // no content → skipped
                    ],
                },
            ],
        };
        expect(headerDocToDesired(doc)).toEqual([
            { sourceKey: "enrollment.lead_count", vizType: "kpi_card", sortOrder: 0, accent: "blue" },
            { sourceKey: "enrollment.tour_conversion_rate", vizType: "trend_card", sortOrder: 10, size: "standard" },
        ]);
    });

    it("diffs by source_key (idempotent) and classifies add/remove", () => {
        const same = headerDocToDesired(headerViewsToDoc(views));
        const noop = diffHeaderPlacements(views, same);
        expect(noop.creates).toEqual([]);
        expect(noop.removes).toEqual([]);
        expect(noop.updates.map((u) => u.id).sort()).toEqual(["h1", "h2"]);

        const desired = headerDocToDesired({
            sections: [{ sectionId: IMPLICIT_SECTION_ID, title: "", cards: [
                { instanceId: "h1", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: { rendererKey: "kpi_card" } },
                { instanceId: "new", cardTypeKey: "kpi", contentId: "ops.work_overdue_count", config: { rendererKey: "kpi_card" } },
            ] }],
        });
        const plan = diffHeaderPlacements(views, desired);
        expect(plan.creates.map((c) => c.sourceKey)).toEqual(["ops.work_overdue_count"]);
        expect(plan.removes).toEqual([{ id: "h2" }]); // needs_attention dropped
        expect(plan.updates.map((u) => u.id)).toEqual(["h1"]);
    });

    it("context_config carries size/accent only when set", () => {
        expect(headerContextConfig({})).toEqual({ version: 1 });
        expect(headerContextConfig({ size: "compact", accent: "ember" })).toEqual({ version: 1, size: "compact", accent: "ember" });
    });

    it("context_config carries showHealthChip when set", () => {
        expect(headerContextConfig({ showHealthChip: false })).toEqual({ version: 1, showHealthChip: false });
        expect(headerContextConfig({ showHealthChip: true })).toEqual({ version: 1, showHealthChip: true });
        expect(headerContextConfig({ accent: "amber", showHealthChip: false })).toEqual({ version: 1, accent: "amber", showHealthChip: false });
    });

    it("showHealthChip round-trips through SurfaceDoc (view→doc→desired)", () => {
        const withChip: HeaderPlacementView[] = [
            { id: "x1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 0, accent: "amber", showHealthChip: false },
        ];
        const doc = headerViewsToDoc(withChip);
        expect(doc.sections[0].cards[0].config).toMatchObject({ showHealthChip: "off" });

        const desired = headerDocToDesired(doc);
        expect(desired[0]).toMatchObject({ sourceKey: "enrollment.lead_count", accent: "amber", showHealthChip: false });
    });

    it("showHealthChip: true round-trips as 'on' in doc config", () => {
        const withChip: HeaderPlacementView[] = [
            { id: "x2", sourceKey: "ops.work_overdue_count", vizType: "kpi_card", label: "Overdue", sortOrder: 0, showHealthChip: true },
        ];
        const doc = headerViewsToDoc(withChip);
        expect(doc.sections[0].cards[0].config).toMatchObject({ showHealthChip: "on" });

        const desired = headerDocToDesired(doc);
        expect(desired[0]).toMatchObject({ showHealthChip: true });
    });

    it("showHealthChip absent in view → absent in doc config and desired", () => {
        const noChip: HeaderPlacementView[] = [
            { id: "x3", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 0 },
        ];
        const doc = headerViewsToDoc(noChip);
        expect(doc.sections[0].cards[0].config).not.toHaveProperty("showHealthChip");

        const desired = headerDocToDesired(doc);
        expect(desired[0]).not.toHaveProperty("showHealthChip");
    });
});
