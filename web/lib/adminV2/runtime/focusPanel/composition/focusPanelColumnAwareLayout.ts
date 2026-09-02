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
 * practice: the ORDER a card takes within the columns it occupies. `rowSpan`
 * becomes a minimum height rather than a hard vertical extent. Both round-trip
 * through the existing fields, so published layouts keep rendering — the only
 * difference is that gaps they never intended disappear.
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
    /** Measured natural height per card; falls back to `minHeightFor` when absent. */
    heights: ReadonlyMap<string, number>;
    /** Canvas content width in px. */
    width: number;
    gapPx: number;
    /** The floor a card's own span asks for, when nothing has been measured yet. */
    minHeightFor: (area: FocusPanelGridArea) => number;
};

/**
 * Resolve every card's box from the columns it occupies. PURE.
 *
 * Each card falls to the lowest bottom edge among the already-placed cards whose
 * columns it overlaps — so a tall card pushes down only what sits beneath IT, and
 * a card in disjoint columns starts at the top regardless of how tall its
 * neighbour is.
 */
export function resolveColumnAwareLayout(input: ColumnAwareInput): ColumnAwareLayout {
    const { layout, heights, width, gapPx, minHeightFor } = input;
    const columns = Math.max(1, layout.columns);
    const track = Math.max(0, (width - (columns - 1) * gapPx) / columns);
    const xOf = (colStart: number) => (colStart - 1) * (track + gapPx);
    const widthOf = (colSpan: number) => colSpan * track + Math.max(0, colSpan - 1) * gapPx;

    const placed: ColumnAwareBox[] = [];
    packOrder(layout.areas).forEach((area, index) => {
        const height = Math.max(heights.get(area.card) ?? 0, minHeightFor(area));
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

export type ColumnAwareDropInput = {
    layout: FocusPanelGridLayout;
    /** The card being dragged, carrying its AUTHORED span. */
    moving: FocusPanelGridArea;
    /** Where the pointer says the card belongs horizontally. */
    colStart: number;
    /** Pointer Y, in the same space as the measured boxes. */
    pointerY: number;
    /** Gutter between stacked cards. */
    gapPx?: number;
    /** What is currently on screen — the one truth both composer and runtime render. */
    boxes: ReadonlyMap<string, MeasuredBox>;
};

export type ColumnAwareDropResult = {
    layout: FocusPanelGridLayout;
    /** The card the dragged one now follows in its own columns, or null for the top. */
    after: string | null;
    /** The cards whose columns the dragged card shares — the only ones that constrain it. */
    overlapping: string[];
    /** Where the card goes: these columns, this Y. */
    rect: { colStart: number; colSpan: number; top: number };
};

/**
 * AUTHORING IN THE SAME GEOMETRY THE RUNTIME RENDERS.
 *
 * ── THE HYBRID THIS REPLACES ──
 *
 * Rendering became column-aware; authoring did not. The drag still asked
 * `gridTemplateRows` for a row index — a coordinate system the renderer had
 * stopped using, since cards are positioned from measured geometry now. So the
 * pointer was answering a question about rows that no longer existed, and the
 * operator could not author what they were plainly pointing at.
 *
 * ── WHAT THE POINTER IS ACTUALLY SAYING ──
 *
 * Not "Attendance is row 7". It is saying "Attendance is in columns 1-6,
 * immediately after Process". Vertical order is a relationship between cards
 * that OVERLAP horizontally, and nothing else: Children and Household in columns
 * 7-12 have no standing to push a card in columns 1-6 up or down.
 *
 * So the drop is resolved as a position in the stack of the columns the card will
 * occupy: find the cards it will share columns with, see which of them the
 * pointer is below, and insert it there.
 *
 * ── AND `rowStart` STILL SERIALISES IT ──
 *
 * The constraints form a partial order — disjoint columns are genuinely
 * unordered — and a scalar cannot express a partial order. It does not have to:
 * every partial order has a linear extension, and the resolver only ever stacks
 * a card against cards it overlaps, so any linear extension consistent with the
 * column-local constraints renders identically. `rowStart` records one such
 * extension. That is why this needs no schema change and no migration: the field
 * keeps its shape and gains an honest meaning.
 */
/**
 * THE COLUMN THE POINTER IS ASKING FOR — and grab offset is not part of it.
 *
 * The destination used to be `pointerColumn - grabOffset`, so where inside the
 * card you happened to press decided which start columns you could reach. Grab a
 * six-column card by its right side and the left half became unreachable without
 * dragging the cursor off the canvas; grab it in the middle and it straddled
 * columns 5-10 instead of snapping to a half. Same pointer, different answer,
 * depending on an invisible detail of the pickup. That is the flakiness.
 *
 * Surface Builder is a snap-to-layout composer, not a window manager. The card
 * centres on the pointer and snaps to the nearest legal start for its span, so
 * every start owns a contiguous band of pointer positions and the answer is a
 * function of (pointer, span, canvas) alone. Where you grabbed it affects the
 * pickup and nothing else.
 */
export function snapColumnStart(args: {
    pointerColumn: number;
    colSpan: number;
    columns: number;
}): number {
    const columns = Math.max(1, args.columns);
    const colSpan = Math.max(1, Math.min(args.colSpan, columns));
    const maxStart = columns - colSpan + 1;
    /*
     * Slots, not free positions. A six-column card has a left half and a right
     * half; a four-column card has thirds. Centring the card on the pointer would
     * be smoother and wrong — pointer column 7 would centre a 6-span card across
     * 5-10, straddling the middle, which is the composition nobody asks for. So
     * the canvas is divided into span-sized bands and the card takes the band the
     * pointer is in, clamped to the last legal start.
     */
    const slot = 1 + Math.floor((args.pointerColumn - 1) / colSpan) * colSpan;
    return Math.min(maxStart, Math.max(1, slot));
}

export function resolveColumnAwareDrop(input: ColumnAwareDropInput): ColumnAwareDropResult {
    const { layout, moving, colStart, pointerY, boxes, gapPx = 10 } = input;
    const columns = Math.max(1, layout.columns);
    const colSpan = Math.max(1, Math.min(moving.colSpan, columns));
    const clampedCol = Math.min(Math.max(1, Math.round(colStart)), columns - colSpan + 1);
    const target = { ...moving, colStart: clampedCol, colSpan };

    const others = layout.areas.filter((a) => a.card !== moving.card);

    /*
     * ── SOLVE THE RECTANGLE, NOT AN ORDER ──
     *
     * The drop's answer is a rectangle: these columns, this Y. Y is the bottom of
     * the last card the pointer has passed among those this card overlaps
     * HORIZONTALLY, plus one gutter — Health's destination is literally
     * `Household.bottom + 10`. Nothing else is consulted, so Attendance cannot
     * affect it: it does not share a column with Health, and that is the entire
     * test.
     *
     * This replaces a global reading-order splice-and-renumber that produced the
     * same answer by a longer route, and dragged every unrelated card's ordering
     * through the computation on the way. Order is now a CONSEQUENCE of the
     * rectangles — derived once, at the end, for serialisation — rather than the
     * mechanism.
     */
    const overlapping = others
        .filter((a) => columnsOverlap(a, target))
        .map((a) => ({ area: a, box: boxes.get(a.card) }))
        .filter((entry): entry is { area: FocusPanelGridArea; box: MeasuredBox } => Boolean(entry.box))
        .sort((a, b) => a.box.top - b.box.top);

    let top = 0;
    let after: string | null = null;
    for (const entry of overlapping) {
        // Past this card's middle? Then the card belongs below it.
        if (pointerY >= entry.box.top + entry.box.height / 2) {
            top = entry.box.top + entry.box.height + gapPx;
            after = entry.area.card;
        } else break;
    }

    /*
     * Serialise. Every card keeps the Y it is already drawn at; the dragged one
     * takes the Y just solved. Sorting on that gives the reading order the
     * persisted `rowStart` records — a consequence of the geometry rather than an
     * input to it.
     */
    const positioned = [
        ...others.map((area) => ({
            area, top: boxes.get(area.card)?.top ?? Number.MAX_SAFE_INTEGER, moving: false,
        })),
        { area: target, top, moving: true },
    ].sort((a, b) => {
        if (a.top !== b.top) return a.top - b.top;
        // A tie means the pointer asked for a Y a card already holds. The pointer
        // wins and the incumbent yields — that is what "drop it above this" means.
        if (a.moving !== b.moving) return a.moving ? -1 : 1;
        return a.area.colStart - b.area.colStart;
    });

    return {
        layout: {
            ...layout,
            areas: positioned.map((entry, index) => ({ ...entry.area, rowStart: index + 1 })),
        },
        after,
        overlapping: overlapping.map((entry) => entry.area.card),
        /** The rectangle the pointer asked for — the actual answer. */
        rect: { colStart: clampedCol, colSpan, top },
    };
}
