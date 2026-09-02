/**
 * EXPLICIT DROP CANDIDATES — the destinations a drag can reach, enumerated and drawn.
 *
 * ── WHY INFERENCE HAD TO GO ──
 *
 * The composer used to answer "where does this card go?" by running the pointer
 * through a chain of inferences: pointer → column band → row track → position in a
 * global reading order → rectangle. Every link was defensible on its own and the
 * chain as a whole was unpredictable, because none of it was visible. The operator
 * could not see that a left-hand destination existed, so a gesture that missed it
 * was indistinguishable from a destination that was not offered — and six rounds of
 * QA could not tell those two apart from the outside.
 *
 * The fix is not a better inference. It is to stop inferring. The set of legal
 * destinations for a card is small, computable, and finite; so compute it, DRAW it,
 * and let the pointer select one. The drag problem becomes
 *
 *     pointer → visible candidate rectangle
 *
 * and "is there a left destination?" stops being a question about a solver's
 * internals and becomes a thing you can see on the screen.
 *
 * ── HOW A CANDIDATE IS BUILT ──
 *
 * For the moving card's authored span: enumerate the legal horizontal starts, and
 * for each one, the useful insertion points among the cards that share those
 * columns — before the first, and after each. Then resolve each of those through
 * `resolveColumnAwareLayout`, the SAME engine that renders the canvas, and keep the
 * Y it actually produces.
 *
 * That last step is what makes the zone honest. A candidate's advertised top is not
 * an estimate of where the card would land; it is the result of laying the card out
 * there. Zone, preview and commit are the same computation, so they cannot disagree
 * — which is the failure mode this whole module exists to end.
 */

import {
    resolveColumnAwareLayout,
    columnsOverlap,
    type MeasuredBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type {
    FocusPanelGridArea,
    FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** A rectangle in the canvas's content box. */
export type CandidateRect = { left: number; top: number; width: number; height: number };

export type DropCandidate = {
    /** Stable within one drag — the React key and the test handle. */
    id: string;
    colStart: number;
    colSpan: number;
    /** Where the card lands. Resolved by the renderer's own engine, not estimated. */
    top: number;
    /** The card this one follows within its own columns; null means first. */
    after: string | null;
    /** The cards sharing at least one column — the only ones that constrain it. */
    overlapping: string[];
    /** Where the card lands, drawn. */
    rect: CandidateRect;
    /**
     * The pointer territory this candidate owns. Bands TILE their column region
     * top to bottom, so every point belongs to exactly one candidate per region and
     * there is no gap between targets to fall into.
     */
    hit: CandidateRect;
    /** What the zone says. "Top of the left column", "Below Household". */
    label: string;
};

export type DropCandidateInput = {
    layout: FocusPanelGridLayout;
    /** The card being dragged, carrying its AUTHORED span. */
    moving: FocusPanelGridArea;
    /** What is on screen right now, measured. */
    boxes: ReadonlyMap<string, MeasuredBox>;
    /** Canvas content width, px. */
    width: number;
    gapPx: number;
    /** Minimum height a card's own span asks for, when nothing is measured. */
    minHeightFor: (area: FocusPanelGridArea) => number;
    /** Operator-facing card names, for zone labels. */
    labelFor?: (card: string) => string;
};

/**
 * The horizontal starts a span may legally take. PURE.
 *
 * Span-sized bands, not free positions: a half-width card has a left half and a
 * right half, a third-width card has thirds. Centring on the pointer would be
 * smoother and wrong — it produces the straddled composition nobody asks for. The
 * last band is clamped to the last legal start, which is how a two-thirds card
 * offers "left-aligned" and "right-aligned" rather than an unreachable third.
 */
export function legalColumnStarts(args: { columns: number; colSpan: number }): number[] {
    const columns = Math.max(1, args.columns);
    const colSpan = Math.max(1, Math.min(args.colSpan, columns));
    const maxStart = columns - colSpan + 1;
    const starts: number[] = [];
    for (let start = 1; start <= maxStart; start += colSpan) starts.push(start);
    // A span that does not divide the canvas leaves a remainder on the right that no
    // band reaches. Offer the right-aligned placement explicitly rather than losing it.
    if (starts[starts.length - 1] !== maxStart) starts.push(maxStart);
    return starts;
}

/**
 * Build the layout that results from placing `moving` at `colStart`, immediately
 * after `after` in the packing order. PURE.
 *
 * Order is expressed the only way the persisted contract can express it — through
 * `rowStart` — but it is derived here from what is MEASURED on screen, so the
 * ordering the operator is looking at is the ordering that gets rearranged.
 */
export function layoutWithCandidate(args: {
    layout: FocusPanelGridLayout;
    moving: FocusPanelGridArea;
    colStart: number;
    after: string | null;
    boxes: ReadonlyMap<string, MeasuredBox>;
}): FocusPanelGridLayout {
    const { layout, moving, colStart, after, boxes } = args;
    const columns = Math.max(1, layout.columns);
    const colSpan = Math.max(1, Math.min(moving.colSpan, columns));
    const target: FocusPanelGridArea = {
        ...moving,
        colStart: Math.min(Math.max(1, colStart), columns - colSpan + 1),
        colSpan,
    };

    const others = layout.areas
        .filter((a) => a.card !== moving.card)
        .map((a) => ({ area: a, top: boxes.get(a.card)?.top ?? Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => (a.top !== b.top ? a.top - b.top : a.area.colStart - b.area.colStart))
        .map((entry) => entry.area);

    const ordered: FocusPanelGridArea[] = [];
    if (after === null) {
        // First in its own columns: ahead of the first card it will share a column with,
        // so nothing it overlaps can claim the top away from it.
        const firstOverlapping = others.findIndex((a) => columnsOverlap(a, target));
        const at = firstOverlapping === -1 ? others.length : firstOverlapping;
        ordered.push(...others.slice(0, at), target, ...others.slice(at));
    } else {
        const at = others.findIndex((a) => a.card === after);
        const insertAt = at === -1 ? others.length : at + 1;
        ordered.push(...others.slice(0, insertAt), target, ...others.slice(insertAt));
    }

    return {
        ...layout,
        areas: ordered.map((area, index) => ({ ...area, rowStart: index + 1 })),
    };
}

/**
 * Every destination this card can reach, as rectangles. PURE.
 *
 * Duplicates are merged: "after Children" and "before Household" are the same
 * authored result when Household follows Children, and the operator should be
 * offered one target there, not two stacked on the same pixels.
 */
export function enumerateDropCandidates(input: DropCandidateInput): DropCandidate[] {
    const { layout, moving, boxes, width, gapPx, minHeightFor, labelFor } = input;
    const columns = Math.max(1, layout.columns);
    const colSpan = Math.max(1, Math.min(moving.colSpan, columns));
    const track = Math.max(0, (width - (columns - 1) * gapPx) / columns);
    const xOf = (colStart: number) => (colStart - 1) * (track + gapPx);
    const widthOf = (span: number) => span * track + Math.max(0, span - 1) * gapPx;
    const name = (card: string) => labelFor?.(card) ?? card;

    const others = layout.areas.filter((a) => a.card !== moving.card);
    const movingHeight = Math.max(boxes.get(moving.card)?.height ?? 0, minHeightFor(moving));

    const candidates: DropCandidate[] = [];

    for (const colStart of legalColumnStarts({ columns, colSpan })) {
        const region = { colStart, colSpan };
        const stack = others
            .filter((a) => columnsOverlap(a, region))
            .map((a) => ({ area: a, box: boxes.get(a.card) }))
            .filter((e): e is { area: FocusPanelGridArea; box: MeasuredBox } => Boolean(e.box))
            .sort((a, b) => a.box.top - b.box.top);

        // Before the first, and after each: the insertion points that mean something.
        const insertions: Array<string | null> = [null, ...stack.map((e) => e.area.card)];
        const seen = new Set<number>();

        for (const after of insertions) {
            const candidateLayout = layoutWithCandidate({ layout, moving, colStart, after, boxes });
            const resolved = resolveColumnAwareLayout({
                layout: candidateLayout,
                heights: new Map([...boxes].map(([card, box]) => [card, box.height])),
                width,
                gapPx,
                minHeightFor,
            });
            const landed = resolved.boxes.find((b) => b.card === moving.card);
            if (!landed) continue;

            // MERGE: two insertion points that resolve to the same Y are one destination.
            const key = Math.round(landed.top);
            if (seen.has(key)) continue;
            seen.add(key);

            candidates.push({
                id: `${colStart}:${key}`,
                colStart,
                colSpan,
                top: landed.top,
                after,
                overlapping: stack.map((e) => e.area.card),
                rect: {
                    left: Math.round(xOf(colStart)),
                    top: landed.top,
                    width: Math.round(widthOf(colSpan)),
                    height: Math.round(movingHeight),
                },
                // Filled in once the region's candidates are known — bands tile.
                hit: { left: 0, top: 0, width: 0, height: 0 },
                label:
                    after === null ?
                        stack.length === 0 ? "Place here"
                        : `Above ${name(stack[0]!.area.card)}`
                    :   `Below ${name(after)}`,
            });
        }
    }

    return tileHitBands(candidates, { movingHeight, gapPx });
}

/**
 * Give each candidate the pointer territory it owns. PURE.
 *
 * Within one column region the bands run from each candidate's top to the next
 * candidate's top, so they tile the region exactly: no overlap to make selection
 * ambiguous, and no gap between two targets for a pointer to land in and select
 * neither. The last band runs on past the content, because "below everything" is a
 * destination the operator reaches by dragging into open space.
 */
function tileHitBands(
    candidates: readonly DropCandidate[],
    args: { movingHeight: number; gapPx: number },
): DropCandidate[] {
    const byRegion = new Map<number, DropCandidate[]>();
    for (const candidate of candidates) {
        const bucket = byRegion.get(candidate.colStart) ?? [];
        bucket.push(candidate);
        byRegion.set(candidate.colStart, bucket);
    }

    const out: DropCandidate[] = [];
    for (const bucket of byRegion.values()) {
        const sorted = [...bucket].sort((a, b) => a.top - b.top);
        sorted.forEach((candidate, index) => {
            const next = sorted[index + 1];
            const bottom =
                next ? next.top
                    // Open space below the last card: a generous target, not a hairline.
                :   candidate.top + Math.max(args.movingHeight, 120);
            out.push({
                ...candidate,
                hit: {
                    left: candidate.rect.left,
                    top: candidate.top,
                    width: candidate.rect.width,
                    height: Math.max(1, bottom - candidate.top),
                },
            });
        });
    }
    return out;
}

/**
 * The candidate the pointer is choosing. PURE.
 *
 * Containment first — if the pointer is inside a zone, that zone wins. Otherwise
 * the nearest one, so the pointer ALWAYS names a destination and a drag can never
 * arrive at "no answer". Distance dominates and the centre only breaks ties, which
 * is what keeps two horizontally overlapping regions (a two-thirds card's left and
 * right alignments) resolving to whichever the pointer is genuinely nearer.
 */
export function pickDropCandidate(
    candidates: readonly DropCandidate[],
    pointer: { x: number; y: number },
): DropCandidate | null {
    let best: DropCandidate | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        const { left, top, width, height } = candidate.hit;
        const dx = pointer.x < left ? left - pointer.x : pointer.x > left + width ? pointer.x - (left + width) : 0;
        const dy = pointer.y < top ? top - pointer.y : pointer.y > top + height ? pointer.y - (top + height) : 0;
        const outside = Math.hypot(dx, dy);
        const centre = Math.hypot(pointer.x - (left + width / 2), pointer.y - (top + height / 2));
        const score = outside * 10000 + centre;
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}

/** The layout a candidate commits to. The same call the zone's Y came from. PURE. */
export function applyDropCandidate(args: {
    layout: FocusPanelGridLayout;
    moving: FocusPanelGridArea;
    candidate: DropCandidate;
    boxes: ReadonlyMap<string, MeasuredBox>;
}): FocusPanelGridLayout {
    return layoutWithCandidate({
        layout: args.layout,
        moving: args.moving,
        colStart: args.candidate.colStart,
        after: args.candidate.after,
        boxes: args.boxes,
    });
}
