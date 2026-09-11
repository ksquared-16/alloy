/**
 * Which positions an operator may actually choose when adjusting a waitlist row.
 *
 * ── WHY THIS IS NOT "1 TO 999" ──
 *
 * The adjust command takes a `pin_ordinal` scoped to the row's own group, while the rank the row
 * DISPLAYS is scoped to the section it is listed in. Those are different numbers, which is exactly
 * what `pin_scoped_to_cohort` explains: a row can be pinned first in its group and still show 3/7,
 * because the section lists an earlier group ahead of it. The old control offered a free-text box
 * from 1 to 999, so an operator could type a number that means nothing in the row's own group and
 * get a result that looks wrong without being wrong.
 *
 * The bound comes from the canonical label the placement engine already produced —
 * `parseWaitlistRankParts` — so this introduces NO second ranking rule. It only refuses to offer a
 * move the model cannot express.
 */
import { parseWaitlistRankParts } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

/**
 * How many positions the control lists in full before it falls back to a window + Custom.
 *
 * ── WHY THIS IS NOT 10 ──
 *
 * It was 10, and 10 is not a number this domain produces. The deployed Firefly INFANT section holds
 * twelve candidates across two cohorts, so the pinned cohort `infant_0_18_months` holds eleven — and
 * an operator who wanted position 11 found the list stopped at 10 and had to discover "Custom…" to
 * reach a position that is perfectly ordinary in their own group. The cap was a UI convenience
 * standing in front of a legal move.
 *
 * The BOUND on a move is still the cohort total and has not changed: `total` below is
 * `runtime_group_total`, published by the placement engine, and nothing here recomputes it. This
 * constant only decides how many of those legal positions are offered as a click rather than a
 * keystroke, so raising it cannot let the control express a move the command cannot mean.
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
    /** True when the row's pin applies within its group rather than the whole section. */
    scopedToGroup: boolean;
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
    precedenceReason?: string | null,
    /**
     * The GROUP-LOCAL range published by the placement engine
     * (`runtime_group_position` / `runtime_group_total`). When present it WINS over the section
     * label, because that is the range the command can actually express.
     *
     * The section label answers "where am I in the list I am reading" — a different question. A
     * section holding `infant` and `infant_0_18_months` shows 12 while the pinned candidate's own
     * cohort holds 11, so bounding on the label offered a "12" the write had to clamp: the
     * operator's number silently became a different number. Nothing is recomputed here; this only
     * prefers the authority that already answered.
     */
    group?: { position?: number | null; total?: number | null } | null,
): WaitlistAdjustPositionModel {
    const scopedToGroup = precedenceReason === "pin_scoped_to_cohort";
    const groupTotal = typeof group?.total === "number" && group.total > 0 ? Math.trunc(group.total) : null;
    const groupPosition =
        typeof group?.position === "number" && group.position > 0 ? Math.trunc(group.position) : null;
    if (groupTotal != null) {
        const listed = waitlistAdjustListedCount(groupTotal);
        const options: number[] = [];
        for (let i = 1; i <= listed; i++) options.push(i);
        if (groupPosition != null && groupPosition > listed && groupPosition <= groupTotal) options.push(groupPosition);
        return {
            options,
            total: groupTotal,
            current: groupPosition,
            scopedToGroup,
            customReachesFurther: groupTotal > listed,
        };
    }
    // No group range published (non-candidate row, or an engine that did not rank it): fall back to
    // the section label rather than inventing a range.
    const parts = parseWaitlistRankParts(positionLabel);
    if (!parts) {
        return { options: [], total: null, current: null, scopedToGroup, customReachesFurther: true };
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
        scopedToGroup,
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
