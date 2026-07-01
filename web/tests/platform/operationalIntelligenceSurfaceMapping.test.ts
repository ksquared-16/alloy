import { describe, expect, it } from "vitest";

import {
    placementsToSurfaceDoc,
    surfaceDocToDesiredPlacements,
    diffPlacements,
    cardTypeToVizType,
    vizTypeToCardType,
    sectionToZone,
    OI_ZONES,
    type OiPlacementView,
} from "@/lib/metrics/platform/operationalIntelligenceSurfaceMapping";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const views: OiPlacementView[] = [
    { id: "p1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Lead count", zone: "overview", sortOrder: 10 },
    { id: "p2", sourceKey: "enrollment.tour_conversion_rate", vizType: "trend_card", label: "Tour", zone: "overview", sortOrder: 0 },
    { id: "p3", sourceKey: "ops.needs_attention_count", vizType: "kpi_card", label: "Attn", zone: "health", sortOrder: 0 },
];

describe("OI placement ⇄ SurfaceDoc mapping", () => {
    it("card type ⇄ visualization type round-trips; renderer override wins", () => {
        expect(cardTypeToVizType("kpi")).toBe("kpi_card");
        expect(cardTypeToVizType("breakdown")).toBe("bar_chart");
        expect(cardTypeToVizType("kpi", "trend_card")).toBe("trend_card"); // explicit renderer wins
        expect(cardTypeToVizType("affected_work")).toBeNull(); // not a real visualization
        expect(vizTypeToCardType("scorecard")).toBe("health");
        expect(vizTypeToCardType("sparkline")).toBe("trend");
    });

    it("builds a doc with all four zones, sorted within a zone", () => {
        const doc = placementsToSurfaceDoc(views);
        expect(doc.sections.map((s) => s.sectionId)).toEqual([...OI_ZONES]);
        const overview = doc.sections[0];
        expect(overview.cards.map((c) => c.instanceId)).toEqual(["p2", "p1"]); // sortOrder 0 before 10
        expect(overview.cards[0]).toMatchObject({
            contentId: "enrollment.tour_conversion_rate",
            cardTypeKey: "trend",
            config: { rendererKey: "trend_card" },
        });
        expect(doc.sections.find((s) => s.sectionId === "trends")?.cards).toEqual([]);
    });

    it("flattens a doc into desired placements, skipping no-content and non-visual cards", () => {
        const doc: SurfaceDoc = {
            sections: [
                {
                    sectionId: "overview",
                    title: "Overview",
                    cards: [
                        { instanceId: "a", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: {} },
                        { instanceId: "b", cardTypeKey: "trend", contentId: "enrollment.tour_conversion_rate", config: { rendererKey: "trend_card" } },
                        { instanceId: "c", cardTypeKey: "kpi", contentId: null, config: {} }, // no content → skip
                        { instanceId: "d", cardTypeKey: "affected_work", contentId: "ops.needs_attention_count", config: {} }, // not a viz → skip
                    ],
                },
            ],
        };
        const desired = surfaceDocToDesiredPlacements(doc);
        expect(desired).toEqual([
            { zone: "overview", sourceKey: "enrollment.lead_count", vizType: "kpi_card", sortOrder: 0 },
            { zone: "overview", sourceKey: "enrollment.tour_conversion_rate", vizType: "trend_card", sortOrder: 10 },
        ]);
    });

    it("maps unknown section ids onto the overview zone", () => {
        expect(sectionToZone("health")).toBe("health");
        expect(sectionToZone("operational-pulse")).toBe("overview");
    });
});

describe("OI save payload (diff by zone + source_key — idempotent)", () => {
    it("re-publishing the same doc yields only updates (no creates/removes)", () => {
        const desired = surfaceDocToDesiredPlacements(placementsToSurfaceDoc(views));
        const plan = diffPlacements(views, desired);
        expect(plan.creates).toEqual([]);
        expect(plan.removes).toEqual([]);
        expect(plan.updates.map((u) => u.id).sort()).toEqual(["p1", "p2", "p3"]);
    });

    it("classifies add / remove / reorder correctly", () => {
        // Drop the tour trend, add overdue work to overview, keep attention in health.
        const doc: SurfaceDoc = {
            sections: [
                {
                    sectionId: "overview",
                    title: "Overview",
                    cards: [
                        { instanceId: "p1", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: {} },
                        { instanceId: "new", cardTypeKey: "kpi", contentId: "ops.work_overdue_count", config: {} },
                    ],
                },
                { sectionId: "health", title: "Health", cards: [{ instanceId: "p3", cardTypeKey: "kpi", contentId: "ops.needs_attention_count", config: {} }] },
            ],
        };
        const plan = diffPlacements(views, surfaceDocToDesiredPlacements(doc));
        expect(plan.creates).toEqual([{ zone: "overview", sourceKey: "ops.work_overdue_count", vizType: "kpi_card", sortOrder: 10 }]);
        expect(plan.removes).toEqual([{ id: "p2" }]); // tour conversion removed
        expect(plan.updates.map((u) => `${u.id}:${u.sortOrder}`).sort()).toEqual(["p1:0", "p3:0"]);
    });

    it("collapses a duplicate metric in the same zone into a remove", () => {
        const dupes: OiPlacementView[] = [
            ...views,
            { id: "p1b", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Lead count", zone: "overview", sortOrder: 20 },
        ];
        const plan = diffPlacements(dupes, surfaceDocToDesiredPlacements(placementsToSurfaceDoc(views)));
        expect(plan.removes).toEqual([{ id: "p1b" }]);
    });
});
