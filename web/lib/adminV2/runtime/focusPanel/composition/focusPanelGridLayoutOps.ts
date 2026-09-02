/**
 * Experience Builder V5 — responsive GRID authoring operations (pure, server-safe).
 *
 * The builder authors a `FocusPanelGridLayout` (cards placed as {colStart,colSpan,
 * rowStart,rowSpan} regions on an N-column grid). These ops snap/clamp to the grid and
 * keep a derived reading-order `rows` representation so every legacy consumer of the
 * published layout still works. The runtime renders the grid directly (CSS Grid).
 *
 * @see focusPanelPublishedLayout.ts (model + planner) · docs/platform/operator/experience-builder-doctrine.md
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    gridAreasInReadingOrder,
    resolveRowUnits,
    type FocusPanelCellHeight,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Default ROW SPAN per card (in builder authoring tracks ≈ 76px each) so a newly placed
 * or freshly-seeded tile opens tall enough to show its FULL summary card — not clipped to
 * a single minimum-height row. Household/Children carry the most evidence (tallest);
 * Readiness needs room for the full progress card; Current Work is shortest. The operator
 * can still drag a tile shorter. Cards not listed get a sensible default.
 */
export const DEFAULT_CARD_ROW_SPAN: Partial<Record<FocusPanelCardKey, number>> = {
    household: 3,
    children: 4,
    readiness_kpi: 3,
    current_work: 4,
};
export function defaultRowSpanForCard(card: FocusPanelCardKey): number {
    return DEFAULT_CARD_ROW_SPAN[card] ?? 2;
}

/** An empty grid on the given track count (default 12). */
export function emptyGridLayout(columns: number = FOCUS_PANEL_GRID_COLUMNS): FocusPanelGridLayout {
    return { columns, areas: [] };
}

/** The cards currently placed on the grid, in reading order. */
export function cardsInGrid(grid: FocusPanelGridLayout): FocusPanelCardKey[] {
    return gridAreasInReadingOrder(grid).map((a) => a.card);
}

export function findArea(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridArea | undefined {
    return grid.areas.find((a) => a.card === card);
}

/** Snap + clamp an area so it sits fully inside the grid (colStart/colSpan within columns). */
export function clampArea(grid: FocusPanelGridLayout, area: FocusPanelGridArea): FocusPanelGridArea {
    const colSpan = clamp(Math.round(area.colSpan), 1, grid.columns);
    const colStart = clamp(Math.round(area.colStart), 1, grid.columns - colSpan + 1);
    const rowSpan = Math.max(1, Math.round(area.rowSpan));
    const rowStart = Math.max(1, Math.round(area.rowStart));
    return { ...area, colStart, colSpan, rowStart, rowSpan };
}

/** The first row index with no placed area (so a newly-added card lands in free space). */
export function nextFreeRow(grid: FocusPanelGridLayout): number {
    if (grid.areas.length === 0) return 1;
    return Math.max(...grid.areas.map((a) => a.rowStart + a.rowSpan - 1)) + 1;
}



/** True when two areas share any column occupancy. PURE. */
function columnsOverlap(a: FocusPanelGridArea, b: FocusPanelGridArea): boolean {
    const aEnd = a.colStart + a.colSpan;
    const bEnd = b.colStart + b.colSpan;
    return a.colStart < bEnd && b.colStart < aEnd;
}

/**
 * Same vertical stack lane — exact colStart, or near-start overlap of a narrower
 * card (e.g. col 7 vs 8). Does not stack half-width side cards under full-width
 * neighbours solely because columns intersect. PURE.
 */
function sameStackColumn(a: FocusPanelGridArea, b: FocusPanelGridArea): boolean {
    if (a.colStart === b.colStart) return true;
    if (!columnsOverlap(a, b)) return false;
    const overlap =
        Math.min(a.colStart + a.colSpan, b.colStart + b.colSpan) - Math.max(a.colStart, b.colStart);
    const narrower = Math.min(a.colSpan, b.colSpan);
    if (overlap < Math.max(1, Math.floor(narrower * 0.8))) return false;
    return Math.abs(a.colStart - b.colStart) <= Math.floor(narrower / 2);
}

/** True rectangle overlap between two placed regions. PURE. */
function regionsCollide(a: FocusPanelGridArea, b: FocusPanelGridArea): boolean {
    const hOverlap = a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan;
    const vOverlap = a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan;
    return hOverlap && vOverlap;
}

/**
 * Resolve overlapping cards into a vertical stack. PURE.
 *
 * ── TWO PASSES, AND WHY BOTH ARE NEEDED ──
 *
 * `sameStackColumn` is a PREFERENCE: it decides which cards read as belonging to
 * one visual column, so a card dropped onto a column pushes that column down
 * rather than shouldering into a neighbour. It is a heuristic and it is right to
 * be one.
 *
 * It was also, until now, the ONLY thing standing between the model and an
 * overlap — and a heuristic cannot carry an invariant. Two cards that genuinely
 * collide but fail the "same column" test were simply left on top of each other:
 *
 *   attendance 1/8 vs staff 7/6   → 2 columns of overlap, narrower span 6,
 *                                   2 < 80% of 6, so not "the same column"
 *   business_process 1/12 vs health_safety 9/4
 *                                 → colStarts 8 apart, so not "the same column"
 *
 * Both were produced by ordinary drags in the real builder and both left one card
 * sitting on another. So the heuristic still runs first, for the layout it
 * produces — and then a second pass ENFORCES the invariant the product actually
 * promises: at rest, no two cards occupy the same cell. A card that still
 * collides is pushed below everything it collides with, which terminates because
 * every push moves it strictly downward.
 */
export function normalizeGridColumnStacking(grid: FocusPanelGridLayout): FocusPanelGridLayout {
    const order = new Map(grid.areas.map((area, index) => [area.card, index]));
    const sorted = [...grid.areas].sort((a, b) => {
        if (a.rowStart !== b.rowStart) return a.rowStart - b.rowStart;
        if (a.colStart !== b.colStart) return a.colStart - b.colStart;
        // Same start cell: later array entry (just-placed move target) wins the slot
        // so insert-above / swap onto the top of a column works.
        return (order.get(b.card) ?? 0) - (order.get(a.card) ?? 0);
    });
    const placed: FocusPanelGridArea[] = [];
    for (const area of sorted) {
        let rowStart = area.rowStart;
        // Pass 1 — the column-stacking preference.
        for (const prior of placed) {
            if (!sameStackColumn(prior, area)) continue;
            const priorEnd = prior.rowStart + prior.rowSpan;
            const areaEnd = rowStart + area.rowSpan;
            if (rowStart < priorEnd && areaEnd > prior.rowStart) rowStart = priorEnd;
        }
        // Pass 2 — the invariant. Repeat until nothing collides: pushing below one
        // card can move this one into another.
        for (let guard = 0; guard < placed.length + 1; guard += 1) {
            const candidate = { ...area, rowStart };
            const hit = placed.find((prior) => regionsCollide(prior, candidate));
            if (!hit) break;
            rowStart = hit.rowStart + hit.rowSpan;
        }
        placed.push(clampArea(grid, { ...area, rowStart }));
    }
    return { ...grid, areas: placed };
}

/** Every pair of regions that occupy a common cell. PURE — for guards and diagnostics. */
export function gridOverlaps(
    grid: FocusPanelGridLayout,
): Array<{ a: FocusPanelCardKey; b: FocusPanelCardKey }> {
    const out: Array<{ a: FocusPanelCardKey; b: FocusPanelCardKey }> = [];
    for (let i = 0; i < grid.areas.length; i += 1) {
        for (let j = i + 1; j < grid.areas.length; j += 1) {
            if (regionsCollide(grid.areas[i]!, grid.areas[j]!)) {
                out.push({ a: grid.areas[i]!.card, b: grid.areas[j]!.card });
            }
        }
    }
    return out;
}

/** Place (or replace) a card's region. Snaps/clamps to the grid. PURE. */
export function placeArea(grid: FocusPanelGridLayout, area: FocusPanelGridArea): FocusPanelGridLayout {
    const next = clampArea(grid, area);
    // Append the placed card last so normalize prefers it on same-row ties.
    const areas = [...grid.areas.filter((a) => a.card !== area.card), next];
    return normalizeGridColumnStacking({ ...grid, areas });
}

/**
 * FIRST FIT — the leftmost free slot on the earliest row that can hold this width.
 *
 * A new card used to be dropped full-width on a brand-new row, which is why authoring an 8/12 and
 * then a 4/12 produced two rows with a four-column hole beside the first: the packing an operator
 * obviously meant (8 + 4) was available and never taken.
 *
 * This scans existing rows for a gap wide enough and returns it, falling back to a fresh row when
 * nothing fits. It only ever places into genuinely EMPTY columns, so it cannot overlap; and it
 * prefers the earliest row, so cards pack upward instead of drifting down the canvas.
 */
function firstFit(
    grid: FocusPanelGridLayout,
    colSpan: number,
    rowSpan: number,
): { colStart: number; rowStart: number } {
    const lastRow = grid.areas.length
        ? Math.max(...grid.areas.map((a) => a.rowStart + a.rowSpan - 1))
        : 0;
    for (let row = 1; row <= lastRow; row += 1) {
        // Columns occupied by anything whose vertical extent covers this row.
        const taken = new Set<number>();
        for (const a of grid.areas) {
            const covers = a.rowStart <= row && row < a.rowStart + a.rowSpan;
            if (!covers) continue;
            for (let c = a.colStart; c < a.colStart + a.colSpan; c += 1) taken.add(c);
        }
        for (let start = 1; start + colSpan - 1 <= grid.columns; start += 1) {
            let fits = true;
            for (let c = start; c < start + colSpan; c += 1) {
                if (taken.has(c)) { fits = false; break; }
            }
            // The whole vertical extent must be free, not merely this row — a taller card
            // dropped into a one-row gap would collide with whatever sits below it.
            if (fits && rowSpan > 1) {
                for (const a of grid.areas) {
                    const vOverlap = a.rowStart < row + rowSpan && row < a.rowStart + a.rowSpan;
                    if (!vOverlap) continue;
                    const hOverlap = a.colStart < start + colSpan && start < a.colStart + a.colSpan;
                    if (hOverlap) { fits = false; break; }
                }
            }
            if (fits) return { colStart: start, rowStart: row };
        }
    }
    return { colStart: 1, rowStart: nextFreeRow(grid) };
}

/**
 * Add a card, packed into the first slot that fits its declared width. PURE.
 *
 * `colSpan` defaults to the full row only when the caller states no width — an authored placement
 * always states one, so the default is the honest answer for "I don't know how wide this is"
 * rather than the shape every new card takes.
 */
export function addCardToGrid(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    opts?: { colSpan?: number; rowSpan?: number },
): FocusPanelGridLayout {
    if (findArea(grid, card)) return grid;
    const colSpan = Math.max(1, Math.min(opts?.colSpan ?? grid.columns, grid.columns));
    const rowSpan = opts?.rowSpan ?? defaultRowSpanForCard(card);
    const slot = firstFit(grid, colSpan, rowSpan);
    return placeArea(grid, {
        card,
        colStart: slot.colStart,
        colSpan,
        rowStart: slot.rowStart,
        rowSpan,
    });
}

/** Move a card's region to a new top-left cell (snap/clamp). PURE. */
export function moveArea(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    colStart: number,
    rowStart: number,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, colStart, rowStart });
}

/** Resize a card's region by column/row span (snap/clamp, min 1). PURE. */
export function resizeArea(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    colSpan: number,
    rowSpan: number,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, colSpan, rowSpan });
}

/** Set a region's reserved room (height). PURE. */
export function setAreaHeight(
    grid: FocusPanelGridLayout,
    card: FocusPanelCardKey,
    height: FocusPanelCellHeight | undefined,
): FocusPanelGridLayout {
    const area = findArea(grid, card);
    if (!area) return grid;
    return placeArea(grid, { ...area, height });
}

export const COMPOSER_GRID_ROW_UNIT_PX = 76;
export const COMPOSER_GRID_GAP_PX = 10;

/**
 * Close empty row bands, and change nothing else. PURE.
 *
 * ── WHY NOT GRAVITY ──
 *
 * Per-card gravity (`packGridInReadingOrder`) re-decides every card's row from
 * scratch: each falls to the earliest row it fits. That is why a requested row
 * was never authoritative. An exhaustive sweep of both reference layouts found
 * 30 visible vacancies where the card landed ABOVE the cell the pointer asked
 * for — "c7r4: landed row 3", "c1r8: landed row 6" — the column honoured every
 * time and the row overridden every time. Which is precisely the operator's
 * report: Children could not be put in the open row under the top row, and cards
 * felt flaky around particular destinations.
 *
 * Removing empty BANDS does the one thing compaction is actually for — no
 * phantom rows — without touching relative geometry. Every card keeps its column
 * and its row order; the canvas just stops reserving rows nothing occupies.
 */
export function closeEmptyRowBands(grid: FocusPanelGridLayout): FocusPanelGridLayout {
    if (!grid.areas.length) return grid;
    const occupied = new Set<number>();
    for (const a of grid.areas) {
        for (let r = a.rowStart; r < a.rowStart + a.rowSpan; r += 1) occupied.add(r);
    }
    const lastRow = Math.max(...grid.areas.map((a) => a.rowStart + a.rowSpan - 1));
    // How many empty rows sit strictly above each row — the distance it may rise.
    const rise: number[] = [];
    let empties = 0;
    for (let r = 1; r <= lastRow; r += 1) {
        rise[r] = empties;
        if (!occupied.has(r)) empties += 1;
    }
    return {
        ...grid,
        areas: grid.areas.map((a) => ({ ...a, rowStart: a.rowStart - (rise[a.rowStart] ?? 0) })),
    };
}

/** Free = no placed card shares a cell with this rectangle. PURE. */
function rectangleIsFree(
    others: readonly FocusPanelGridArea[],
    candidate: FocusPanelGridArea,
): boolean {
    return !others.some((other) => regionsCollide(other, candidate));
}

/**
 * MEASURED TRACK GEOMETRY — the composer's real coordinate system.
 *
 * ── WHY MEASURED, AND NOT COMPUTED ──
 *
 * The composer used to pin its rows to a fixed 76px so pointer maths could assume
 * a constant pitch. That assumption bought arithmetic and paid for it in truth: a
 * card whose content is taller than `rowSpan × 76` cannot make a fixed row grow,
 * so it OVERFLOWED its grid area and painted over whatever was declared beneath
 * it. Measured on the live canvas, Financials overflowed its 162px area by 309px
 * and covered Health & Safety by 298px; Attendance covered Financials by 221px.
 * The declared areas never overlapped — the rendered cards did, which is what an
 * operator sees and what QA kept reporting.
 *
 * It also broke dragging in exactly the reported way. The grab offset is
 * `pointerRow − area.rowStart`; over a card that visually spans six rows while
 * declaring two, that offset is large and wrong, so the drop landed far below
 * ("snaps back toward the bottom") and upward moves clamped at row 1 and were
 * then pushed back down by collision snapping ("some cards refuse to move up").
 *
 * The rows are content-sized now, like the runtime's. That removes the overflow —
 * and it also removes the constant pitch, so geometry can no longer be computed
 * from a constant at all. It is read from the browser's own resolved track sizes
 * (`getComputedStyle().gridTemplateRows` returns used px, implicit rows included),
 * which is the only description of the canvas that is true by construction.
 */
export function trackEdges(sizes: readonly number[], gapPx: number): number[] {
    const edges: number[] = [0];
    for (let i = 0; i < sizes.length; i += 1) {
        edges.push(edges[i]! + (sizes[i] ?? 0) + gapPx);
    }
    return edges;
}

/** Parse a computed track list ("76px 120px …") into numbers. PURE. */
export function parseTrackSizes(computed: string | null | undefined): number[] {
    return String(computed ?? "")
        .split(/\s+/)
        .map((t) => Number.parseFloat(t))
        .filter((n) => Number.isFinite(n) && n >= 0);
}

/**
 * Offset → 1-based track index, against MEASURED edges.
 *
 * Past the last measured track the index continues on the last track's pitch:
 * dropping below every existing row is a legitimate move (append to the end), and
 * refusing it would be the "cannot move to the bottom" defect in the other
 * direction.
 */
export function trackFromOffset(offset: number, edges: readonly number[], fallbackPitch: number): number {
    if (offset < 0 || edges.length < 2) return 1;
    for (let i = 0; i < edges.length - 1; i += 1) {
        if (offset < edges[i + 1]!) return i + 1;
    }
    const last = edges[edges.length - 1]!;
    const pitch = fallbackPitch > 0 ? fallbackPitch : COMPOSER_GRID_ROW_UNIT_PX + COMPOSER_GRID_GAP_PX;
    return edges.length - 1 + Math.max(0, Math.floor((offset - last) / pitch)) + 1;
}

/**
 * THE ONE OWNER OF COMPOSER GRID GEOMETRY.
 *
 * ── THE DEFECT THIS REPLACES ──
 *
 * Two places converted pixels to cells — the pointer mapping and the ghost — and
 * both used `surfaceWidth / columns` as the column width. A CSS grid of
 * `repeat(12, minmax(0, 1fr))` with a 10px `column-gap` does not have 12 equal
 * columns of `W/12`: it has 12 tracks of `(W - 11·gap)/12`, each followed by a
 * gap. The two models agree exactly at column 1 and diverge by a further ~9px per
 * column after that.
 *
 * That is why dragging "worked" on the left of the canvas and got progressively
 * less predictable toward the right: near a boundary the pointer resolved to the
 * neighbouring column, and the ghost was drawn where the card would NOT land.
 * The card and the preview of the card disagreed, which reads to an operator as
 * drag-and-drop being broken rather than as an arithmetic error.
 *
 * Both callers now derive from here, so they cannot drift apart again.
 */
export function composerGridMetrics(surfaceWidthPx: number, columns: number) {
    const cols = Math.max(1, columns);
    // Track width, gaps excluded — the same quantity the browser lays out.
    const trackWidth = Math.max(0, (surfaceWidthPx - (cols - 1) * COMPOSER_GRID_GAP_PX) / cols);
    return {
        columns: cols,
        trackWidth,
        /** Distance from one column's start to the next: track + gap. */
        columnPitch: trackWidth + COMPOSER_GRID_GAP_PX,
        rowHeight: COMPOSER_GRID_ROW_UNIT_PX,
        rowPitch: COMPOSER_GRID_ROW_UNIT_PX + COMPOSER_GRID_GAP_PX,
    };
}

/** Remove a card's region. PURE. */
export function removeArea(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridLayout {
    return { ...grid, areas: grid.areas.filter((a) => a.card !== card) };
}

/**
 * Derive the reading-order `rows` fallback from a grid (one full-width cell per card,
 * top→bottom/left→right) so legacy consumers + responsive collapse keep working.
 */
export function deriveRowsFromGrid(grid: FocusPanelGridLayout): FocusPanelPublishedLayout["rows"] {
    return gridAreasInReadingOrder(grid).map((a) => ({
        cells: [{ width: "full" as const, cards: [a.card], height: a.height }],
    }));
}

/**
 * Convert an existing row/lane/stack published layout into grid placement (so the grid
 * canvas can seed from an already-published row layout). Each row's cells map to areas
 * left→right by their resolved column units; stacked cards drop onto successive rows.
 * If the layout already carries a `grid`, it is returned as-is. PURE.
 */
export function gridFromPublishedLayout(
    layout: FocusPanelPublishedLayout,
    columns: number = FOCUS_PANEL_GRID_COLUMNS,
): FocusPanelGridLayout {
    if (layout.grid) return layout.grid;
    const areas: FocusPanelGridArea[] = [];
    let row = 1;
    for (const r of layout.rows) {
        const units = resolveRowUnits(r.cells);
        let col = 1;
        let rowsUsed = 1;
        r.cells.forEach((cell, i) => {
            const colSpan = Math.max(1, Math.min(units[i] ?? 1, columns));
            let stackRow = row;
            cell.cards.forEach((card) => {
                // Seed each card at its natural summary height so tiles open un-clipped.
                const rowSpan = defaultRowSpanForCard(card);
                areas.push({ card, colStart: Math.min(col, columns - colSpan + 1), colSpan, rowStart: stackRow, rowSpan, height: cell.height });
                stackRow += rowSpan;
            });
            rowsUsed = Math.max(rowsUsed, stackRow - row);
            col += colSpan;
        });
        row += rowsUsed;
    }
    return { columns, areas };
}

/** Build a full published layout from a grid (grid = source of truth, rows = fallback). */
export function buildPublishedLayoutFromGrid(grid: FocusPanelGridLayout): FocusPanelPublishedLayout {
    const rows = deriveRowsFromGrid(grid);
    // A grid must yield at least one row for the back-compat invariant.
    return { grid, rows: rows.length > 0 ? rows : [{ cells: [{ width: "full", cards: [] as FocusPanelCardKey[] }] }] };
}
