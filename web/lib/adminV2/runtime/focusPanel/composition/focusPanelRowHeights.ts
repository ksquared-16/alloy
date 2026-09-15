/**
 * THE BAND SOLVER — what the published composition gives a card, as distinct from what
 * the card's content needs.
 *
 *     intrinsic   what the card's content needs   measured   owned by the card
 *     assigned    what the authored band gives it solved     owned by the composition
 *
 * This module only ever receives measurements and returns numbers. It holds no element,
 * reads no rectangle and cannot observe its own output, so the assignment it produces can
 * never come back as an intrinsic height.
 *
 * ── WHAT IT EQUALISES, AND WHAT IT LEAVES ALONE ──
 *
 * Cards sharing a VISUAL BAND share its height (see `focusPanelVisualBands`). Cards in
 * different bands are left completely independent — which is what keeps the 268px defect
 * that killed the global row model from coming back, since a band is never wider than the
 * rows some card actually occupies.
 *
 * Within a band, cards that share a column form a chain and stack on each other. The band
 * is as tall as its tallest chain, and every shorter chain is stretched to match:
 *
 *     ┌──────────────┬──────────────┐
 *     │      A       │              │   A + gap + B is one chain
 *     ├──────────────┤      C       │   C is another
 *     │      B       │              │   band height = max(A+gap+B, C)
 *     └──────────────┴──────────────┘   so top(C) == top(A) and bottom(C) == bottom(B)
 *
 * A chain's shortfall is spread EQUALLY across its cards, so two stacked cards growing to
 * meet a taller neighbour each take half the difference rather than one absorbing all of
 * it. For the common single-card chain that is simply "take the band's height".
 *
 * ── AND IT NEVER PRESCRIBES ──
 *
 * `rowSpan` is not consulted as a height. It says which authored rows a card occupies, and
 * therefore which band it belongs to; how tall the band is comes from measured content
 * alone. A band whose cards all shrink shrinks with them.
 */

import { columnsOverlap, packOrder } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import { columnChains, deriveVisualBands, type BandArea } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelVisualBands";
import type { FocusPanelGridArea } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

export type RowSolverArea = BandArea;

export type RowSolverInput = {
    areas: readonly RowSolverArea[];
    /** Measured content height per card. A card absent here has not been measured yet. */
    intrinsic: ReadonlyMap<string, number>;
    gapPx: number;
};

export type RowSolverResult = {
    /** Solved height per visual band, keyed by the band's authored `rowStart`. */
    bandHeights: ReadonlyMap<number, number>;
    /** The height the composition gives each card. Cards it cannot speak for are absent. */
    assigned: ReadonlyMap<string, number>;
};

/**
 * Stack one band's cards on each other, forward only. PURE.
 *
 * The same rule `resolveColumnAwareLayout` places the whole canvas with — a card falls
 * until it clears the cards it overlaps horizontally — applied to one band so the solver
 * and the placement engine cannot drift apart.
 */
function topsWithin(areas: readonly BandArea[], heights: ReadonlyMap<string, number>, gapPx: number): Map<string, number> {
    const tops = new Map<string, number>();
    const placed: { area: BandArea; top: number; bottom: number }[] = [];
    for (const area of packOrder(areas as readonly FocusPanelGridArea[]) as unknown as BandArea[]) {
        let top = 0;
        for (const prior of placed) {
            if (!columnsOverlap(prior.area as FocusPanelGridArea, area as FocusPanelGridArea)) continue;
            top = Math.max(top, prior.bottom + gapPx);
        }
        tops.set(area.card, top);
        placed.push({ area, top, bottom: top + (heights.get(area.card) ?? 0) });
    }
    return tops;
}

/**
 * Solve every band, and give each card the height its band implies. PURE.
 *
 * A band with any unmeasured card is left entirely alone: an assignment derived from a
 * height nobody has measured is a guess, and a guess here becomes a rectangle on screen.
 * Those cards keep their own intrinsic height until the measurement arrives.
 */
export function solveRowHeights(input: RowSolverInput): RowSolverResult {
    const { areas, intrinsic, gapPx } = input;
    const bandHeights = new Map<number, number>();
    const assigned = new Map<string, number>();

    for (const band of deriveVisualBands(areas)) {
        if (band.areas.some((area) => !intrinsic.has(area.card))) continue;

        const tops = topsWithin(band.areas, intrinsic, gapPx);
        const bottomOf = (area: BandArea) => (tops.get(area.card) ?? 0) + (intrinsic.get(area.card) ?? 0);

        const chains = columnChains(band.areas);
        // The band is as tall as the chain that needs the most room.
        const height = chains.reduce(
            (tallest, chain) => Math.max(tallest, chain.reduce((low, area) => Math.max(low, bottomOf(area)), 0)),
            0,
        );
        bandHeights.set(band.rowStart, height);

        for (const chain of chains) {
            const bottom = chain.reduce((low, area) => Math.max(low, bottomOf(area)), 0);
            const share = (height - bottom) / chain.length;
            for (const area of chain) {
                assigned.set(area.card, (intrinsic.get(area.card) ?? 0) + share);
            }
        }
    }

    return { bandHeights, assigned };
}
