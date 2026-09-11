/**
 * Which positions an operator may actually choose when adjusting a waitlist row.
 *
 * ── ONE RANKED UNIVERSE, ONE RANGE ──
 *
 * The position a row displays and the position this control edits are the same number, in the same
 * scope: the waitlist SECTION the operator is reading. A row shown at `2/12` opens on `2` and can
 * be moved anywhere in `1..12`.
 *
 * It was not always so. The command's `pin_ordinal` was once scoped to the row's own
 * `program_room_cohort_key` while the displayed rank was scoped to the section, so one number was
 * read and a different one edited — and because a section can hold several cohorts, some displayed
 * positions could not be reached at all. `applySectionManualPositions` now places a pin within the
 * section, which collapses the two domains into one.
 *
 * The bound still comes from the canonical label the placement engine produced
 * (`parseWaitlistRankParts`), so this introduces NO second ranking rule. It only refuses to offer a
 * move the model cannot express.
 */
import { parseWaitlistRankParts } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

/**
 * How many positions the control lists in full before it falls back to a window + Custom.
 *
 * ── WHY THIS IS NOT 10 ──
 *
 * It was 10, and 10 is not a number this domain produces. The deployed Firefly INFANT section holds
 * twelve ranked candidates, and an operator who wanted position 11 or 12 found the list stopped at
 * 10 and had to discover "Custom…" to reach a position that is perfectly ordinary in the list they
 * are reading. The cap was a UI convenience standing in front of a legal move.
 *
 * The BOUND on a move is the ranked set the row is displayed in — `total` below comes from the
 * canonical label the placement engine produced, and nothing here recomputes it. This constant only
 * decides how many of those legal positions are offered as a click rather than a keystroke, so
 * raising it cannot let the control express a move the command cannot mean.
 *
 * Twenty-five covers the cohorts this product actually has — a room's waitlist, not a phone book —
 * while keeping a genuinely long list from becoming an unusable menu. Beyond it the control lists a
 * window and Custom reaches the rest, exactly as before.
 */
export const WAITLIST_ADJUST_FULL_LIST_MAX = 25;

/**
 * The window listed when a cohort is longer than `WAITLIST_ADJUST_FULL_LIST_MAX`.
 *
 * Kept at the old value: for a cohort that large, a click-list was never going to be the way in, and
 * Custom is. The current position is appended separately so the control always opens able to
 * represent where the row already is.
 */
export const WAITLIST_ADJUST_MAX_LISTED = 10;

/** How many positions to list for a cohort of `total`. PURE. */
export function waitlistAdjustListedCount(total: number): number {
    const n = Math.max(0, Math.trunc(total));
    return n <= WAITLIST_ADJUST_FULL_LIST_MAX ? n : WAITLIST_ADJUST_MAX_LISTED;
}

export type WaitlistAdjustPositionModel = {
    /** Selectable ordinals, ascending. Always includes the current position when known. */
    options: number[];
    /** Highest ordinal the model can express for this row, or null when unknown. */
    total: number | null;
    /** The row's current ordinal, or null when the label carried none. */
    current: number | null;
    /** True when more positions exist than are listed, so Custom is the only way to reach them. */
    customReachesFurther: boolean;
};

/**
 * Derive the selectable positions for a row from its canonical label and precedence reason.
 *
 * An unparseable label yields no options and a null total: the control then offers Custom only,
 * rather than inventing a range. Silence is the honest answer when the engine said nothing.
 */
export function waitlistAdjustPositionModel(
    positionLabel: string | null | undefined,
): WaitlistAdjustPositionModel {
    // The canonical label IS the range: `2/12` means position 2 of a ranked set of 12, and a manual
    // move may address any of those 12. There is no second scope to prefer.
    const parts = parseWaitlistRankParts(positionLabel);
    if (!parts) {
        return { options: [], total: null, current: null, customReachesFurther: true };
    }
    const total = parts.denominator;
    const listed = waitlistAdjustListedCount(total);
    const options: number[] = [];
    for (let i = 1; i <= listed; i++) options.push(i);
    // The current position must always be selectable, even on a long queue where it falls outside
    // the listed window — otherwise the control opens unable to represent where the row already is.
    if (parts.numerator > listed && parts.numerator <= total) options.push(parts.numerator);
    return {
        options,
        total,
        current: parts.numerator,
        customReachesFurther: total > listed,
    };
}

/**
 * Is a typed custom position expressible for this row?
 *
 * Bounded by the row's own total rather than the API's 1-999 guard: the API limit stops nonsense,
 * but a position past the end of this row's scope is a move the operator cannot actually make, and
 * refusing it here is what keeps the control from promising one.
 */
export function isValidWaitlistAdjustPosition(
    value: number,
    model: Pick<WaitlistAdjustPositionModel, "total">,
): boolean {
    if (!Number.isInteger(value) || value < 1) return false;
    if (model.total == null) return value <= 999;
    return value <= model.total;
}
