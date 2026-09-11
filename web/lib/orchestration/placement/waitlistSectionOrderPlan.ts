/**
 * ONE PLANNER, SHARED BY THE RENDERER AND THE WRITER.
 *
 * ── THE FAILURE THIS EXISTS TO PREVENT ──
 *
 * A previous writer tried to move a candidate by doing arithmetic on the PINS alone — open the
 * requested seat, shift whoever was at or below it. That is sound only while every pin already sits
 * at its true position. It is not sound for a section carrying legacy duplicate ordinals, because
 * renumbering duplicates requires knowing the order the RENDERER puts them in, and the renderer
 * breaks ties by natural rank. The writer broke them by `created_at`.
 *
 * The two disagreed, and on the deployed tenant four pre-existing director adjustments were
 * silently rearranged: TP8 2→4, TP3 4→7, TP11 6→5, TP10 8→6. Nobody asked for that.
 *
 * So the writer does not get its own ordering rules. It is handed the SAME final order the renderer
 * produced, performs the list move on it, and derives the ordinals that reproduce the result —
 * then checks that they do. No second tie-break exists to disagree with.
 */

/** Move one id to a 1-based target position. PURE. */
export function planListMove(finalOrder: readonly string[], movedId: string, target: number): string[] {
    const without = finalOrder.filter((id) => id !== movedId);
    if (without.length === finalOrder.length) return [...finalOrder];
    const index = Math.min(Math.max(Math.trunc(target) - 1, 0), without.length);
    const next = [...without];
    next.splice(index, 0, movedId);
    return next;
}

/**
 * Reproduce an order from natural rank plus pinned ordinals, exactly as the runtime does. PURE.
 *
 * Mirrors `applySectionManualPositions`: unpinned rows keep natural order, pinned rows are seated
 * ascending at `ordinal - 1`. Kept here so the planner can CHECK its own output rather than assume
 * it; an assertion that never runs is not a guarantee.
 */
export function resolveOrderFromOrdinals(
    naturalOrder: readonly string[],
    ordinals: ReadonlyMap<string, number>,
): string[] {
    const unpinned = naturalOrder.filter((id) => !ordinals.has(id));
    const pinned = naturalOrder
        .filter((id) => ordinals.has(id))
        .map((id, naturalIndex) => ({ id, ordinal: ordinals.get(id)!, naturalIndex }))
        .sort((a, b) => a.ordinal - b.ordinal || a.naturalIndex - b.naturalIndex);

    const placed = [...unpinned];
    let takenThrough = -1;
    for (const entry of pinned) {
        const index = Math.min(Math.max(entry.ordinal - 1, takenThrough + 1), placed.length);
        placed.splice(index, 0, entry.id);
        takenThrough = index;
    }
    return placed;
}

export type CanonicalOrdinalPlan = {
    /** The ordinal each manually positioned candidate must hold, keyed by candidate id. */
    ordinals: Map<string, number>;
    /** True when replaying `ordinals` over the natural order reproduces the desired order exactly. */
    reproduces: boolean;
    /** The order the plan actually reproduces — equal to `desiredOrder` when `reproduces`. */
    resolved: string[];
};

/**
 * The smallest canonical manual-order state that reproduces `desiredOrder`. PURE.
 *
 * Starts from the candidates that are already manually positioned plus the one just moved, gives
 * each its position in the desired order, and replays. Whenever the replay disagrees, the first
 * candidate sitting in the wrong place is promoted to a pin and it replays again — so the plan grows
 * only as far as the order actually requires, and terminates because each pass pins one more row.
 *
 * Ordinals come out unique by construction: they are positions in a list. That is what lets the
 * runtime seat every one of them exactly, and it is why no contention rule is needed anywhere.
 */
export function deriveCanonicalManualOrdinals(args: {
    naturalOrder: readonly string[];
    desiredOrder: readonly string[];
    /** Candidates that already carry a manual position, plus the one being moved. */
    pinnedIds: readonly string[];
}): CanonicalOrdinalPlan {
    const positionOf = new Map(args.desiredOrder.map((id, i) => [id, i + 1]));
    const pinned = new Set(args.pinnedIds.filter((id) => positionOf.has(id)));

    for (let pass = 0; pass <= args.desiredOrder.length; pass += 1) {
        const ordinals = new Map<string, number>();
        for (const id of args.desiredOrder) {
            if (pinned.has(id)) ordinals.set(id, positionOf.get(id)!);
        }
        const resolved = resolveOrderFromOrdinals(args.naturalOrder, ordinals);
        const firstWrong = resolved.findIndex((id, i) => id !== args.desiredOrder[i]);
        if (firstWrong === -1) return { ordinals, reproduces: true, resolved };
        // Pin whichever candidate belongs at the first disagreeing seat and try again.
        const wanted = args.desiredOrder[firstWrong];
        if (wanted == null || pinned.has(wanted)) {
            return { ordinals, reproduces: false, resolved };
        }
        pinned.add(wanted);
    }
    const ordinals = new Map<string, number>();
    for (const id of args.desiredOrder) if (pinned.has(id)) ordinals.set(id, positionOf.get(id)!);
    return { ordinals, reproduces: false, resolved: resolveOrderFromOrdinals(args.naturalOrder, ordinals) };
}
