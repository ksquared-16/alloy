/**
 * COLUMN-AWARE VERTICAL LAYOUT — the Surface canvas's one geometry engine.
 *
 * ── WHY THE ROW MODEL HAD TO GO ──
 *
 * CSS Grid sizes a row across the FULL width of the canvas, so a card's vertical
 * position was decided by every other column's content rather than by its own
 * neighbours. Measured on the live builder: Household ended at y=1448 and Health,
 * directly beneath it in the same columns, began at y=1716 — a 268px gap owned
 * entirely by rows 7-9, which were 76px each and occupied ONLY in columns 1-6 by
 * readiness_kpi and billing_preview. Those rows were not empty, so no compaction
 * could remove them; the right-hand column was simply paying for space the
 * left-hand column was using.
 *
 * That is structural. `[tall Attendance][Household / Health]` cannot be drawn
 * without artificial whitespace while rows are shared, however good the placement
 * solver is.
 *
 * ── THE MODEL ──
 *
 * Horizontal composition is unchanged: twelve columns, authored spans, explicit
 * placement. Vertically, a card falls until it clears the cards it actually
 * overlaps HORIZONTALLY, and nothing else. Two cards in disjoint column ranges
 * cannot affect each other's Y — which is the whole point.
 *
 * ── AND THE PERSISTED CONTRACT IS UNCHANGED ──
 *
 * `rowStart` stops being a global row index and becomes what it always was in
 * practice: the ORDER a card takes within the columns it occupies. `rowSpan` stops
 * prescribing height at all — it is authoring metadata, and the only thing that
 * decides how tall a card is on screen is the content rendered into it for the
 * current subject. Both round-trip through the existing fields, so published layouts
 * keep rendering — the difference is that gaps they never intended disappear, and a
 * card holding two rows of data no longer stands as tall as one holding seventeen.
 */

import type { FocusPanelGridArea, FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** A card's resolved box, in pixels relative to the canvas's content box. */
export type ColumnAwareBox = {
    card: string;
    left: number;
    width: number;
    top: number;
    height: number;
    /** The order this card was packed in — reading order within its columns. */
    order: number;
};

export type ColumnAwareLayout = {
    boxes: ColumnAwareBox[];
    /** Total height the canvas needs, so the container can size itself. */
    contentHeight: number;
};

/** Two areas share at least one column. PURE. */
export function columnsOverlap(
    a: Pick<FocusPanelGridArea, "colStart" | "colSpan">,
    b: Pick<FocusPanelGridArea, "colStart" | "colSpan">,
): boolean {
    return a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan;
}

/** Reading order: down the canvas, then across. The order `rowStart` encodes. PURE. */
export function packOrder(areas: readonly FocusPanelGridArea[]): FocusPanelGridArea[] {
    return [...areas].sort((a, b) =>
        a.rowStart !== b.rowStart ? a.rowStart - b.rowStart : a.colStart - b.colStart,
    );
}

export type ColumnAwareInput = {
    layout: FocusPanelGridLayout;
    /**
     * Measured content height per card. THE authority on how tall a card is.
     *
     * A card absent from this map has not been measured yet (first paint, before the
     * observer reports); only then does `unmeasuredHeightFor` speak.
     */
    heights: ReadonlyMap<string, number>;
    /** Canvas content width in px. */
    width: number;
    gapPx: number;
    /**
     * A placeholder height for a card NOT YET MEASURED, so first paint reserves something
     * card-shaped instead of collapsing to zero.
     *
     * It is not a floor. Once a card has been measured, its measured height wins outright,
     * however much smaller it is — see the note on `resolveColumnAwareLayout`.
     */
    unmeasuredHeightFor: (area: FocusPanelGridArea) => number;
};

/**
 * Resolve every card's box from the columns it occupies. PURE.
 *
 * Each card falls to the lowest bottom edge among the already-placed cards whose
 * columns it overlaps — so a tall card pushes down only what sits beneath IT, and
 * a card in disjoint columns starts at the top regardless of how tall its
 * neighbour is.
 *
 * ── FLOW IS FORWARD ONLY ──
 *
 * Cards are placed in pack order, and a card can only ever read the bottom edges of
 * cards ALREADY placed. Nothing a later card does can move an earlier one: a Children
 * card that grows from two rows to seventeen pushes down what sits beneath it and
 * cannot push Financials — placed before it — backward or upward. That is a property
 * of the loop, not a rule applied afterwards.
 *
 * ── AND HEIGHT COMES FROM CONTENT ──
 *
 * The only heights this reads are measured ones. Nothing here consults an authored
 * row span, a card archetype, or a sibling column's height.
 */
export function resolveColumnAwareLayout(input: ColumnAwareInput): ColumnAwareLayout {
    const { layout, heights, width, gapPx, unmeasuredHeightFor } = input;
    const columns = Math.max(1, layout.columns);
    const track = Math.max(0, (width - (columns - 1) * gapPx) / columns);
    const xOf = (colStart: number) => (colStart - 1) * (track + gapPx);
    const widthOf = (colSpan: number) => colSpan * track + Math.max(0, colSpan - 1) * gapPx;

    const placed: ColumnAwareBox[] = [];
    packOrder(layout.areas).forEach((area, index) => {
        /*
         * WIDTH IS AUTHORED; HEIGHT IS THE CONTENT'S.
         *
         * This was `Math.max(measured, minHeightFor(area))`, and `minHeightFor` derived a
         * floor from the authored `rowSpan` — 76px per row plus gutters. That made the
         * authored span prescribe a vertical extent, which is exactly what it must not do:
         * a Children card holding two children was held open to the height of a card
         * holding seventeen, and every card beneath it inherited whitespace nobody
         * authored. A card whose content shrinks could never shrink back.
         *
         * So the measured height WINS OUTRIGHT once it exists. `??`, not `Math.max`.
         */
        const height = heights.get(area.card) ?? unmeasuredHeightFor(area);
        // The floor this card must clear: only cards sharing at least one column.
        let top = 0;
        for (const prior of placed) {
            const priorArea = layout.areas.find((a) => a.card === prior.card);
            if (!priorArea || !columnsOverlap(priorArea, area)) continue;
            top = Math.max(top, prior.top + prior.height + gapPx);
        }
        placed.push({
            card: area.card,
            left: Math.round(xOf(area.colStart)),
            width: Math.round(widthOf(area.colSpan)),
            top: Math.round(top),
            height: Math.round(height),
            order: index,
        });
    });

    return {
        boxes: placed,
        contentHeight: placed.reduce((tallest, b) => Math.max(tallest, b.top + b.height), 0),
    };
}

/**
 * The row index a resolved box reads as, so the persisted contract keeps working.
 *
 * Cards are numbered down the canvas in the order they were packed. That is
 * exactly what `rowStart` has to mean now — an ordering key within overlapping
 * columns — and re-resolving a serialised layout reproduces the same geometry.
 */
export function serializeToRows(layout: ColumnAwareLayout): Map<string, number> {
    const byTop = [...layout.boxes].sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
    const rows = new Map<string, number>();
    byTop.forEach((box, index) => rows.set(box.card, index + 1));
    return rows;
}

/** A card's resolved vertical extent, as rendered. Only `top`/`height` matter here. */
export type MeasuredBox = { top: number; height: number };
