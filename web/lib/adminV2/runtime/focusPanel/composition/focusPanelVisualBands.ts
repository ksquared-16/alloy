/**
 * VISUAL BANDS — which authored areas share one horizontal band of the canvas.
 *
 * ── ROWSTART IS A PLACEMENT COORDINATE, NOT A ROW IDENTITY ──
 *
 * Column-aware placement advances each column independently, so two cards the operator
 * composed side by side routinely carry DIFFERENT `rowStart` values. Measured on the live
 * Firefly panel, the published composition is:
 *
 *     business_process  colStart 1  colSpan 8   rowStart 1  rowSpan 2
 *     financials        colStart 9  colSpan 4   rowStart 2  rowSpan 2
 *
 * Those two are drawn side by side — each starts at the top of its own column — and an
 * engine that equalises on `rowStart === rowStart` sees two unrelated cards and leaves
 * them 26px apart. That was the defect: the rule was reading a coordinate as an identity.
 *
 * ── WHAT A BAND IS ──
 *
 * A band is a maximal run of authored rows that some card occupies without interruption:
 * merge the authored intervals `[rowStart, rowStart + rowSpan)` and each merged interval
 * is one band. `business_process` [1,3) and `financials` [2,4) overlap, so they are one
 * band — which is exactly the relationship the builder drew and `rowStart` alone lost.
 *
 * This is derived from the PUBLISHED COMPOSITION and nothing else. It never consults a
 * rendered rectangle, a DOM order, a card key or an archetype, so the builder preview and
 * the Work Unit runtime cannot disagree about where a band begins.
 */

import {
    columnsOverlap,
    packOrder,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridArea } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** The authored placement a band solver needs. Structural — no card semantics. */
export type BandArea = Pick<FocusPanelGridArea, "colStart" | "colSpan" | "rowStart" | "rowSpan"> & {
    card: string;
};

export type VisualBand = {
    /** Authored row extent this band covers, half-open. */
    rowStart: number;
    rowEnd: number;
    /** The areas the author placed in it, in pack order. */
    areas: BandArea[];
};

/** The authored rows an area occupies, half-open. PURE. */
export function authoredRowExtent(area: Pick<BandArea, "rowStart" | "rowSpan">): [number, number] {
    const start = Math.max(1, Math.floor(area.rowStart));
    const span = Math.max(1, Math.floor(area.rowSpan));
    return [start, start + span];
}

/**
 * Group authored areas into visual bands. PURE.
 *
 * Merge-intervals over the authored row extents: areas whose extents touch belong to one
 * band, transitively. Two bands can therefore never overlap in authored row space, which
 * is what lets the canvas stack them without any further coordination.
 */
export function deriveVisualBands(areas: readonly BandArea[]): VisualBand[] {
    const ordered = packOrder(areas as readonly FocusPanelGridArea[]) as unknown as BandArea[];
    const bands: VisualBand[] = [];
    for (const area of ordered) {
        const [start, end] = authoredRowExtent(area);
        const open = bands[bands.length - 1];
        // `start < open.rowEnd` — touching at the edge is a new band, not a merged one.
        if (open && start < open.rowEnd) {
            open.rowEnd = Math.max(open.rowEnd, end);
            open.areas.push(area);
            continue;
        }
        bands.push({ rowStart: start, rowEnd: end, areas: [area] });
    }
    return bands;
}

/**
 * Partition one band's areas into column chains. PURE.
 *
 * Within a band, cards that share a column stack on each other and cards that do not are
 * independent — the same rule the placement engine uses, so a chain is exactly the set of
 * cards whose bottoms are coupled. `[Attendance / Health]` is one chain; `[Children]`
 * beside it is another; the band is as tall as its tallest chain.
 */
export function columnChains(areas: readonly BandArea[]): BandArea[][] {
    const chains: BandArea[][] = [];
    for (const area of areas) {
        const joined = chains.filter((chain) =>
            chain.some((member) =>
                columnsOverlap(member as FocusPanelGridArea, area as FocusPanelGridArea),
            ),
        );
        if (joined.length === 0) {
            chains.push([area]);
            continue;
        }
        // This area may bridge chains that were disjoint until now — fold them together.
        const [first, ...rest] = joined;
        first.push(area);
        for (const other of rest) {
            first.push(...other);
            chains.splice(chains.indexOf(other), 1);
        }
    }
    return chains;
}
