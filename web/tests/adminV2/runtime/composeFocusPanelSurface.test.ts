import { describe, expect, it } from "vitest";

import {
    COMPOSITION_COLUMN_BASE,
    COMPOSITION_LANES_MIN_PX,
    COMPOSITION_PAIR_MIN_PX,
    composeFocusPanelSurface,
    compositionReadingOrder,
    type CompositionCardInput,
} from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";

// The Core Four in their Surface Definition order (Household, Readiness, Children, Current Work).
const CORE_FOUR: CompositionCardInput[] = [
    { key: "household", typeKey: "household" },
    { key: "readiness_kpi", typeKey: "readiness_kpi" },
    { key: "children", typeKey: "children" },
    { key: "current_work", typeKey: "current_work" },
];

describe("composition engine v1", () => {
    it("composes interlocking lanes from card weight when the surface is wide", () => {
        const c = composeFocusPanelSurface({ cards: CORE_FOUR, availableWidthPx: 760 });
        expect(c.strategy).toBe("lanes");
        expect(c.lanes).toHaveLength(2);

        const [primary, support] = c.lanes;
        // Heavy anchors carry the lead lane, in reading order.
        expect(primary.role).toBe("primary");
        expect(primary.cards.map((p) => p.typeKey)).toEqual(["household", "children"]);
        // Medium/light cards balance the support lane.
        expect(support.role).toBe("support");
        expect(support.cards.map((p) => p.typeKey)).toEqual(["readiness_kpi", "current_work"]);
    });

    it("gives the anchor lane a DIFFERENT, dominant width (not 50/50)", () => {
        const c = composeFocusPanelSurface({ cards: CORE_FOUR, availableWidthPx: 760 });
        const [primary, support] = c.lanes;
        expect(primary.widthUnits + support.widthUnits).toBe(COMPOSITION_COLUMN_BASE);
        // Dominant lead column, clamped to stay readable on the support side.
        expect(primary.widthUnits).toBeGreaterThan(support.widthUnits);
        expect(primary.widthUnits).toBeGreaterThanOrEqual(6);
        expect(primary.widthUnits).toBeLessThanOrEqual(8);
        expect(support.widthUnits).toBeGreaterThanOrEqual(4);
    });

    it("each card in a lane spans the full lane width (lanes stack vertically)", () => {
        const c = composeFocusPanelSurface({ cards: CORE_FOUR, availableWidthPx: 760 });
        for (const lane of c.lanes) {
            for (const card of lane.cards) {
                expect(card.widthUnits).toBe(lane.widthUnits);
            }
        }
    });

    it("composes a stack with a paired support row at mid widths", () => {
        const c = composeFocusPanelSurface({
            cards: CORE_FOUR,
            availableWidthPx: COMPOSITION_PAIR_MIN_PX + 10,
        });
        expect(c.strategy).toBe("stack");
        const byKey = new Map(c.stack.map((p) => [p.typeKey, p]));
        // Heavy anchors take the full row…
        expect(byKey.get("household")?.widthUnits).toBe(COMPOSITION_COLUMN_BASE);
        expect(byKey.get("children")?.widthUnits).toBe(COMPOSITION_COLUMN_BASE);
        // …support cards pair at half width.
        expect(byKey.get("readiness_kpi")?.widthUnits).toBe(COMPOSITION_COLUMN_BASE / 2);
        expect(byKey.get("current_work")?.widthUnits).toBe(COMPOSITION_COLUMN_BASE / 2);
    });

    it("collapses to a single full-width column on a very narrow surface", () => {
        const c = composeFocusPanelSurface({
            cards: CORE_FOUR,
            availableWidthPx: COMPOSITION_PAIR_MIN_PX - 40,
        });
        expect(c.strategy).toBe("stack");
        for (const card of c.stack) {
            expect(card.widthUnits).toBe(COMPOSITION_COLUMN_BASE);
        }
    });

    it("does not lane when there is no support card (anchors only → single column)", () => {
        const c = composeFocusPanelSurface({
            cards: [
                { key: "household", typeKey: "household" },
                { key: "children", typeKey: "children" },
            ],
            availableWidthPx: 900,
        });
        expect(c.strategy).toBe("stack");
        expect(c.stack.map((p) => p.typeKey)).toEqual(["household", "children"]);
    });

    it("maps card weight to a rendering density (heavy=standard, light=micro)", () => {
        const c = composeFocusPanelSurface({ cards: CORE_FOUR, availableWidthPx: 760 });
        const all = compositionReadingOrder(c);
        const byKey = new Map(all.map((p) => [p.typeKey, p]));
        expect(byKey.get("household")?.density).toBe("standard");
        expect(byKey.get("readiness_kpi")?.density).toBe("compact");
        expect(byKey.get("current_work")?.density).toBe("micro");
    });

    it("reading order interleaves anchor lane then support lane", () => {
        const c = composeFocusPanelSurface({ cards: CORE_FOUR, availableWidthPx: 760 });
        expect(compositionReadingOrder(c).map((p) => p.typeKey)).toEqual([
            "household",
            "children",
            "readiness_kpi",
            "current_work",
        ]);
    });

    it("honours a surface override that re-weights a card", () => {
        const c = composeFocusPanelSurface({
            cards: CORE_FOUR,
            availableWidthPx: 760,
            overrides: { current_work: { weight: "heavy" } },
        });
        const primary = c.lanes.find((l) => l.role === "primary");
        // Re-weighted to heavy → joins the anchor lane.
        expect(primary?.cards.map((p) => p.typeKey)).toContain("current_work");
    });

    it("uses the lanes threshold as the strategy boundary", () => {
        const below = composeFocusPanelSurface({
            cards: CORE_FOUR,
            availableWidthPx: COMPOSITION_LANES_MIN_PX - 1,
        });
        const at = composeFocusPanelSurface({
            cards: CORE_FOUR,
            availableWidthPx: COMPOSITION_LANES_MIN_PX,
        });
        expect(below.strategy).toBe("stack");
        expect(at.strategy).toBe("lanes");
    });
});
