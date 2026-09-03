/**
 * THE PUBLISHED SURFACE THAT TOOK DOWN THE WORK UNIT.
 *
 * A newly published Focus Panel Surface crashed `/workspace/work-unit/waitlist` with
 * "Application error: a client-side exception has occurred". The fault was NOT in the
 * authored composition — it was a contract split down the middle of the published-layout
 * model:
 *
 *   `isFocusPanelPublishedLayout` accepts a stored blob carrying only a `grid`, and says
 *   so in its own comment ("A V5 grid is sufficient on its own; `rows` may be a thin
 *   reading-order fallback"). Every consumer past the validator — the key normalizer,
 *   `planPublishedLayout`, the visibility filter — then read `rows` unconditionally,
 *   because `FocusPanelPublishedLayout` types it as present.
 *
 *   So the validator said yes and the next line threw
 *   `Cannot read properties of undefined (reading 'map')`, inside a client component,
 *   which is exactly the generic Next error screen the operator saw.
 *
 * `rows` is a PROJECTION of the grid, so the repair is to derive it in the reader rather
 * than to require publishers to carry it. These tests hold that line at each seam the
 * published layout crosses, and hold the geometry of the authored composition while they
 * do it — a fix that stopped the crash by dropping cards would pass a "no throw" test and
 * fail the operator.
 */

import { describe, expect, it } from "vitest";

import {
    isFocusPanelPublishedLayout,
    planPublishedLayout,
    publishedLayoutReadingOrder,
    readFocusPanelPublishedLayout,
    deriveRowsFromGrid,
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    buildPublishedLayoutFromGrid,
    gridFromPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import {
    filterPublishedLayoutToVisibleCards,
    type FocusPanelCardVisibility,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import {
    resolveColumnAwareLayout,
    serializeToRows,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * THE ACTUAL PUBLISHED COMPOSITION, COPIED FROM THE ROW THAT CRASHED.
 *
 * `entity_layouts` v143 (entity_type=opportunities, surface=drawer,
 * layout_key=focus_panel_summary), read under a governed read-only census —
 * `doc.metadata.focusPanelLayout.grid`, verbatim. Only the geometry is reproduced here;
 * the rest of that document is tenant configuration and has no business in a fixture.
 *
 * Keep these exact rectangles. Their defining property is that the column ranges OVERLAP
 * — business_process spans columns 1–8 while children and household start at column 7 —
 * so `planLanesFromGrid` cannot flatten them into lanes and the runtime must use the
 * `grid` strategy. That strategy is the only one that mounts the column-aware stack, and
 * it is where the crash lived. A tidier fixture with clean column bands would resolve to
 * `lanes` and quietly stop testing the failing path.
 */
const AUTHORED_GRID: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "business_process" as FocusPanelCardKey, colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
        { card: "financials" as FocusPanelCardKey, colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 2 },
        { card: "attendance" as FocusPanelCardKey, colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
        { card: "health_safety" as FocusPanelCardKey, colStart: 1, colSpan: 6, rowStart: 4, rowSpan: 2 },
        { card: "children" as FocusPanelCardKey, colStart: 7, colSpan: 6, rowStart: 5, rowSpan: 4 },
        { card: "household" as FocusPanelCardKey, colStart: 7, colSpan: 6, rowStart: 6, rowSpan: 4 },
    ],
};

const AUTHORED_CARDS = AUTHORED_GRID.areas.map((a) => a.card);

/** Every stored shape a published Surface can legally arrive in. */
const STORED_SHAPES: Record<string, unknown> = {
    // What the builder writes today: grid (source of truth) + derived rows projection.
    "grid+rows": withPublishedLayoutMetadata(null, buildPublishedLayoutFromGrid(AUTHORED_GRID))
        .focusPanelLayout,
    // The shape the validator has always accepted and the runtime could not consume.
    "grid-only": { grid: AUTHORED_GRID },
    // A publish whose rows projection pruned to nothing while the grid survived.
    "grid+empty-rows": { grid: AUTHORED_GRID, rows: [] },
};

const VISIBILITIES: Record<string, Map<FocusPanelCardKey, FocusPanelCardVisibility>> = {
    "all visible": new Map(),
    // The Children → Health & Safety linkage: the destination is authored on the canvas
    // but navigable-only, so the filter strips it from the initial composition.
    "health & safety linked": new Map([["health_safety" as FocusPanelCardKey, "linked"]]),
    "health & safety hidden": new Map([["health_safety" as FocusPanelCardKey, "hidden"]]),
    "every card hidden": new Map(
        AUTHORED_CARDS.map((c) => [c, "hidden" as FocusPanelCardVisibility]),
    ),
};

/** Widths either side of the single-column collapse threshold, plus the SSR unknown (0). */
const WIDTHS = [0, 320, 559, 560, 1024, 1600];

function read(blob: unknown): FocusPanelPublishedLayout {
    const layout = readFocusPanelPublishedLayout({ metadata: { focusPanelLayout: blob } });
    expect(layout).not.toBeNull();
    return layout!;
}

describe("published Focus Panel Surface → Work Unit runtime", () => {
    describe("deserialization: whatever the validator accepts, the reader must return", () => {
        it.each(Object.keys(STORED_SHAPES))("reads a %s layout without throwing", (name) => {
            const blob = STORED_SHAPES[name];
            expect(isFocusPanelPublishedLayout(blob)).toBe(true);
            expect(() => read(blob)).not.toThrow();
        });

        it("guarantees the `rows` projection its consumers are written against", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                const layout = read(STORED_SHAPES[name]);
                expect(Array.isArray(layout.rows), `${name} rows`).toBe(true);
                // Derived, not empty: a grid-only doc still yields one row per authored card.
                expect(layout.rows.length, `${name} rows length`).toBe(AUTHORED_CARDS.length);
            }
        });

        it("preserves the authored grid exactly — the source of truth is not rewritten", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                const layout = read(STORED_SHAPES[name]);
                expect(layout.grid?.columns, `${name} columns`).toBe(12);
                expect(layout.grid?.areas, `${name} areas`).toEqual(AUTHORED_GRID.areas);
            }
        });

        it("keeps reading order identical across every stored shape", () => {
            const orders = Object.keys(STORED_SHAPES).map((n) =>
                publishedLayoutReadingOrder(read(STORED_SHAPES[n])),
            );
            for (const order of orders) expect(order).toEqual(orders[0]);
            expect(orders[0]).toEqual(deriveRowsFromGrid(AUTHORED_GRID).flatMap((r) =>
                r.cells.flatMap((c) => c.cards),
            ));
        });
    });

    describe("the visibility filter never hands the runtime a half-built layout", () => {
        it.each(Object.keys(STORED_SHAPES))("%s survives every visibility map", (name) => {
            for (const [vName, vis] of Object.entries(VISIBILITIES)) {
                const filtered = filterPublishedLayoutToVisibleCards(read(STORED_SHAPES[name]), vis);
                expect(filtered, `${name}/${vName}`).not.toBeNull();
                expect(Array.isArray(filtered!.rows), `${name}/${vName} rows is an array`).toBe(true);
            }
        });

        it("drops a linked card from geometry without disturbing the others", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                const filtered = filterPublishedLayoutToVisibleCards(
                    read(STORED_SHAPES[name]),
                    VISIBILITIES["health & safety linked"]!,
                )!;
                const placed = filtered.grid!.areas.map((a) => a.card);
                expect(placed, name).toEqual(AUTHORED_CARDS.filter((c) => c !== "health_safety"));
                // The surviving cards keep the exact rectangles the operator authored.
                for (const area of filtered.grid!.areas) {
                    expect(area, `${name}/${area.card}`).toEqual(
                        AUTHORED_GRID.areas.find((a) => a.card === area.card),
                    );
                }
            }
        });
    });

    describe("composition + column-aware runtime: no render exception, at any width", () => {
        it("plans every stored shape × visibility × width without throwing", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                for (const [vName, vis] of Object.entries(VISIBILITIES)) {
                    const filtered = filterPublishedLayoutToVisibleCards(read(STORED_SHAPES[name]), vis)!;
                    for (const width of WIDTHS) {
                        for (const preferLanesFromGrid of [true, false]) {
                            const tag = `${name}/${vName}/${width}px/lanes=${preferLanesFromGrid}`;
                            expect(() => {
                                const plan = planPublishedLayout(filtered, width, { preferLanesFromGrid });
                                // The column-aware engine runs on the grid strategy; drive it at a
                                // pre-measurement width (0) and at real ones.
                                if (plan.strategy === "grid") {
                                    for (const canvas of [0, 400, 1200]) {
                                        const resolved = resolveColumnAwareLayout({
                                            layout: { columns: plan.gridColumns, areas: plan.areas },
                                            heights: new Map(),
                                            width: canvas,
                                            gapPx: 12,
                                            minHeightFor: (a) => a.rowSpan * 76 + (a.rowSpan - 1) * 12,
                                        });
                                        serializeToRows(resolved);
                                    }
                                }
                                gridFromPublishedLayout(filtered);
                            }, tag).not.toThrow();
                        }
                    }
                }
            }
        });

        it("every authored card reaches the plan, whatever the stored shape", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                const layout = read(STORED_SHAPES[name]);
                const plan = planPublishedLayout(layout, 1024, { preferLanesFromGrid: true });
                const planned = new Set([
                    ...plan.areas.map((a) => a.card),
                    ...plan.lanes.flatMap((l) => l.cards.map((c) => c.key)),
                    ...plan.rows.flatMap((r) => r.cells.flatMap((c) => c.cards)),
                ]);
                for (const card of AUTHORED_CARDS) expect(planned.has(card), `${name}/${card}`).toBe(true);
            }
        });

        it("collapses to one readable column below the min width, losing no card", () => {
            for (const name of Object.keys(STORED_SHAPES)) {
                const plan = planPublishedLayout(read(STORED_SHAPES[name]), 320, {
                    preferLanesFromGrid: true,
                });
                expect(plan.collapsed, name).toBe(true);
                expect(plan.rows.flatMap((r) => r.cells.flatMap((c) => c.cards)), name).toEqual(
                    AUTHORED_CARDS,
                );
            }
        });
    });

    describe("the strategy this composition must resolve to", () => {
        it("cannot be flattened into lanes, so the runtime uses the grid strategy", () => {
            // If this ever flips to "lanes", the fixture stopped covering the failing path.
            for (const name of Object.keys(STORED_SHAPES)) {
                const plan = planPublishedLayout(read(STORED_SHAPES[name]), 1024, {
                    preferLanesFromGrid: true,
                });
                expect(plan.strategy, name).toBe("grid");
                expect(plan.areas.map((a) => a.card), name).toEqual(AUTHORED_CARDS);
            }
        });
    });

    describe("column-aware vertical semantics", () => {
        it("gives disjoint columns independent tops — rowStart orders, it does not pin", () => {
            const plan = planPublishedLayout(read(STORED_SHAPES["grid-only"]), 1024, {
                preferLanesFromGrid: false,
            });
            expect(plan.strategy).toBe("grid");
            const TALL = 600;
            const resolved = resolveColumnAwareLayout({
                layout: { columns: plan.gridColumns, areas: plan.areas },
                // business_process occupies columns 1–8 only. Nothing in columns 9–12
                // should pay for its height — that independence IS the model.
                heights: new Map([["business_process" as string, TALL]]),
                width: 1200,
                gapPx: 12,
                minHeightFor: (a) => a.rowSpan * 76 + (a.rowSpan - 1) * 12,
            });
            const box = (card: string) => resolved.boxes.find((b) => b.card === card)!;
            // First in reading order, so it starts at the top.
            expect(box("business_process").top).toBe(0);
            // Columns 9–12: DISJOINT from the tall card, so it also starts at the top.
            // Under the old shared-row model this sat 600px down for nothing.
            expect(box("financials").top).toBe(0);
            // Columns 1–6: overlaps the tall card, so it clears it.
            expect(box("attendance").top).toBeGreaterThanOrEqual(TALL);
            // Same columns as attendance → stacked beneath it, never beside it.
            expect(box("health_safety").top).toBeGreaterThan(box("attendance").top);
        });
    });
});
