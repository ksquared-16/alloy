import { describe, expect, it } from "vitest";

import {
    ANALYTICS_SURFACE_FIXTURES,
    METRIC_GALLERY_CARDS,
    totalFixtureCardCount,
    type AnalyticsMetricCardFixture,
} from "@/app/dev/analytics-surface-mocks/fixtures";

function cardIsValid(card: AnalyticsMetricCardFixture): boolean {
    if (!card.id || !card.label || !card.kind) return false;
    if (card.kind === "breakdown") return Array.isArray(card.segments) && card.segments.length > 0;
    if (card.kind === "scorecard") return Array.isArray(card.metrics) && card.metrics.length > 0;
    if (card.kind === "trend") return Array.isArray(card.sparklinePoints) && card.sparklinePoints.length >= 2;
    return typeof (card as { value?: string }).value === "string";
}

describe("Analytics Surface preview fixtures", () => {
    it("provides the four headline Dashboard surfaces", () => {
        const ids = ANALYTICS_SURFACE_FIXTURES.map((s) => s.id);
        expect(ids).toEqual([
            "executive-performance",
            "operational-intelligence",
            "enrollment-intelligence",
            "financial-performance",
        ]);
    });

    it("every surface has zones and every card is structurally valid", () => {
        for (const surface of ANALYTICS_SURFACE_FIXTURES) {
            expect(surface.title.length).toBeGreaterThan(0);
            expect(surface.zones.length).toBeGreaterThan(0);
            for (const zone of surface.zones) {
                expect(zone.cards.length).toBeGreaterThan(0);
                for (const card of zone.cards) {
                    expect(cardIsValid(card)).toBe(true);
                }
            }
        }
        expect(totalFixtureCardCount()).toBeGreaterThan(0);
    });

    it("the gallery demonstrates every renderer kind, including Health and Breakdown", () => {
        const kinds = new Set(METRIC_GALLERY_CARDS.map((c) => c.kind));
        for (const kind of ["kpi", "trend", "comparison", "scorecard", "health", "breakdown", "chip"]) {
            expect(kinds.has(kind as AnalyticsMetricCardFixture["kind"])).toBe(true);
        }
        expect(METRIC_GALLERY_CARDS.every(cardIsValid)).toBe(true);
    });
});
