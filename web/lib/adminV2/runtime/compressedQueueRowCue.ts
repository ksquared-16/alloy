/**
 * Alloy OS — Queue UX Concept B (compressed row) cue derivation.
 *
 * Pure presentation helper: given the operationally-relevant slots already present
 * on a queue item, derive the two compressed-only affordances Concept B adds to the
 * right edge of the 52px row:
 *
 *   - `childCount`  → the "N children" chip (household grain), shown only when N > 1.
 *   - `rightCue`    → a single right-aligned operational token (tour time, waitlist
 *                     rank, age, room, or location — whichever is most relevant).
 *
 * This introduces NO new data: every input is already resolved on the row view model.
 * It is consumed by QueueBlock only when `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1`, and the
 * rendered element is hidden by CSS unless `data-alloy-os-runtime-split="true"`.
 */

export interface CompressedQueueRowCueInput {
    /** Number of children in the household (household grain). */
    childrenCount?: number | null;
    /** Tour time / window cue (e.g. "Tour: 10:30am"). Highest right-cue priority. */
    tourContext?: string | null;
    /** Waitlist position label (e.g. "#4" or "Preview position 1/8"). */
    waitlistPositionLabel?: string | null;
    /** Age cue (e.g. "2y 4m"). */
    ageContext?: string | null;
    /** Room cue (attendance domains). */
    roomContext?: string | null;
    /** Site/location cue — lowest right-cue priority (Concept B: location unless critical). */
    locationContext?: string | null;
}

export interface CompressedQueueRowCue {
    /** Resolved child count (>= 0). The chip renders only when this is > 1. */
    childCount: number;
    /** Single right-aligned operational token, or null when none is relevant. */
    rightCue: string | null;
}

function cleanCue(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return null;
    return trimmed;
}

/**
 * Resolve the compressed-row cue. Right-cue priority is fixed and domain-agnostic:
 * tour time → waitlist rank → age → room → location. The first present wins so the
 * 52px row never shows more than one trailing token.
 */
export function resolveCompressedQueueRowCue(
    input: CompressedQueueRowCueInput
): CompressedQueueRowCue {
    const rawCount = input.childrenCount ?? 0;
    const childCount = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;

    const rightCue =
        cleanCue(input.tourContext) ??
        cleanCue(input.waitlistPositionLabel) ??
        cleanCue(input.ageContext) ??
        cleanCue(input.roomContext) ??
        cleanCue(input.locationContext);

    return { childCount, rightCue };
}

/** Convenience: should the "N children" chip render for this cue? (household grain, N > 1) */
export function compressedQueueRowShowsChildCount(cue: CompressedQueueRowCue): boolean {
    return cue.childCount > 1;
}
