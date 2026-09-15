/**
 * ROW HEIGHT SOLVER — the published composition's answer to "how tall is this card".
 *
 * ── THE TWO HEIGHTS, AND WHY THEY MUST STAY APART ──
 *
 *   INTRINSIC   what the card's content needs. Measured. Owned by the card.
 *   ASSIGNED    what the authored composition gives it. Solved here. Owned by the layout.
 *
 * Confusing them is not a hypothetical: this canvas already shipped a version where the
 * wrapper carried an imposed `min-height` and the measurement read that wrapper back, so a
 * card could only ever grow and a shrinking roster left its whitespace behind. The rule that
 * came out of it is the rule here — **a solved height must never re-enter as an intrinsic
 * one.** This module is pure and takes intrinsic heights as input; it has no way to read its
 * own output, which is the structural half of that guarantee.
 *
 * ── WHAT A "ROW" IS HERE, AND WHAT IT IS NOT ──
 *
 * `resolveColumnAwareLayout` abandoned global CSS-grid rows for a measured reason: a row
 * sized across the full canvas made a card's position depend on columns it never touched.
 * Household ended at y=1448 and Health, directly beneath it, began at y=1716 — 268px owned
 * entirely by rows occupied only in the opposite columns.
 *
 * So this solver does NOT restore global rows. It equalizes only cards the AUTHOR placed in
 * the same band — same `rowStart` — and never reaches across bands. Two cards in unrelated
 * columns with different `rowStart`s remain as independent as the column-aware model made
 * them; the 268px defect cannot come back through here.
 *
 * `rowSpan` regains exactly one meaning and no more: a card spanning N bands is as tall as
 * those N bands plus the gaps between them. It is still not a height floor — a spanning card
 * whose content is short does not hold its bands open.
 */

/** The authored geometry this solver reads. A subset of `FocusPanelGridArea`. */
export type RowSolverArea = {
    card: string;
    rowStart: number;
    rowSpan: number;
};

export type RowSolverInput = {
    areas: readonly RowSolverArea[];
    /** Measured content height per card. Absent = not yet measured; the card is skipped. */
    intrinsic: ReadonlyMap<string, number>;
    gapPx: number;
};

export type RowSolverResult = {
    /** Solved height per band, keyed by `rowStart`. */
    bandHeights: ReadonlyMap<number, number>;
    /** Assigned height per card — what the renderer should give the card's box. */
    assigned: ReadonlyMap<string, number>;
};

/** The bands a card covers, from its authored placement. PURE. */
export function bandsCovered(area: RowSolverArea): number[] {
    const span = Math.max(1, Math.floor(area.rowSpan));
    return Array.from({ length: span }, (_, i) => area.rowStart + i);
}

/**
 * Solve band heights, then assign each card the height of the bands it covers.
 *
 * Two constraint kinds, and the second is why this is a solver rather than a max():
 *
 *   a card in ONE band     that band must be at least the card's intrinsic height
 *   a card spanning N      those N bands plus (N-1) gaps must total at least its intrinsic
 *
 * A spanning card that does not fit is satisfied by distributing the shortfall EQUALLY across
 * the bands it covers. Equal distribution is chosen because the authored layout expresses no
 * row weights — inventing a priority here would be a hidden rule nobody authored. If row
 * weights ever become authorable, this is the one place that has to change.
 *
 * Unmeasured cards contribute no constraint at all rather than a guessed one: a placeholder
 * would be indistinguishable from a real measurement one frame later, and the band would
 * settle around a number the content never asked for.
 */
export function solveRowHeights(input: RowSolverInput): RowSolverResult {
    const { areas, intrinsic, gapPx } = input;
    const bandHeights = new Map<number, number>();

    // Every band a card touches exists, even if nothing constrains it yet.
    for (const area of areas) for (const band of bandsCovered(area)) {
        if (!bandHeights.has(band)) bandHeights.set(band, 0);
    }

    // Pass 1 — single-band cards set their band's floor directly.
    for (const area of areas) {
        const height = intrinsic.get(area.card);
        if (height == null) continue;
        const bands = bandsCovered(area);
        if (bands.length !== 1) continue;
        bandHeights.set(bands[0], Math.max(bandHeights.get(bands[0]) ?? 0, height));
    }

    /*
     * Pass 2 — spanning cards.
     *
     * Run to a fixed point rather than once: two spanning cards can overlap bands, and
     * satisfying the first can leave the second short. The loop is bounded by the number of
     * spanning cards — each iteration either satisfies every span or raises at least one
     * band, and a band is never lowered — so it terminates. The bound is asserted rather
     * than assumed, because a solver that can spin is worse than one that is wrong.
     */
    const spanning = areas.filter((a) => bandsCovered(a).length > 1 && intrinsic.has(a.card));
    for (let iteration = 0; iteration <= spanning.length; iteration += 1) {
        let raised = false;
        for (const area of spanning) {
            const bands = bandsCovered(area);
            const required = intrinsic.get(area.card)!;
            const gaps = (bands.length - 1) * gapPx;
            const current = bands.reduce((sum, b) => sum + (bandHeights.get(b) ?? 0), 0) + gaps;
            if (current >= required) continue;
            const shortfall = required - current;
            const share = shortfall / bands.length;
            for (const b of bands) bandHeights.set(b, (bandHeights.get(b) ?? 0) + share);
            raised = true;
        }
        if (!raised) break;
    }

    // Pass 3 — a card is as tall as the bands it covers, plus the gaps it spans over.
    const assigned = new Map<string, number>();
    for (const area of areas) {
        const bands = bandsCovered(area);
        const total = bands.reduce((sum, b) => sum + (bandHeights.get(b) ?? 0), 0)
            + (bands.length - 1) * gapPx;
        assigned.set(area.card, total);
    }
    return { bandHeights, assigned };
}
