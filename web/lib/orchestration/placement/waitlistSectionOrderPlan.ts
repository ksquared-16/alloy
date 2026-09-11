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

export type PrefixCanonicalPlan = {
    /** The order the section must end up in. */
    desiredOrder: string[];
    /** Candidate id -> the ordinal its active pin must store. Dense, 1..k, unique. */
    ordinals: Map<string, number>;
    /** Candidates whose existing pin is no longer needed and must be released. */
    releasedIds: string[];
    /** True when replaying `ordinals` reproduces `desiredOrder`. Checked, never assumed. */
    reproduces: boolean;
};

/**
 * Canonicalise a section as a PINNED PREFIX. PURE.
 *
 * ── WHY A PREFIX, AND WHY THIS NEEDS NO NATURAL ORDER ──
 *
 * `deriveCanonicalManualOrdinals` produces a smaller pin set, but it needs the natural order to do
 * it — and the writer cannot observe the natural order. A candidate that has been pinned since
 * before anyone looked has never had its natural rank rendered, so asking the database for "the
 * order without pins" means re-running the whole placement projection in the mutation path, and
 * getting it subtly wrong there is precisely how the previous writer corrupted four live
 * adjustments.
 *
 * A prefix sidesteps the question entirely. Give the rows at positions 1..k the ordinals 1..k and
 * `resolveOrderFromOrdinals` seats each one exactly, in ascending order, at index 0..k-1 — that
 * placement is forced, and no natural rank participates in it. Everything after k is unpinned and
 * falls in natural order.
 *
 * So the result reproduces if and only if the TAIL is already in natural order, and it is, for a
 * reason that survives inspection: `finalOrder` comes from the renderer, where unpinned rows keep
 * their natural relative order by construction. Choosing `k` to cover every pinned row AND the
 * moved row leaves a tail containing only rows that were unpinned before and stay unpinned after,
 * whose relative order the move did not touch. Their order in `finalOrder` IS their natural order.
 *
 * That is why `finalOrder` is a sound stand-in for the natural order in the verification below,
 * even though it is not the natural order: the two agree exactly where this plan relies on them.
 *
 * The cost is honest and bounded — moving to position 3 pins three rows, not the whole section —
 * and it buys a writer that cannot disagree with the renderer, because it never forms an opinion
 * the renderer has to share.
 */
export function planPrefixCanonicalOrdinals(args: {
    /** The section in the order the operator is reading it, as candidate ids. */
    finalOrder: readonly string[];
    movedId: string;
    /** 1-based requested position. This is what the result must equal. */
    target: number;
    /** Candidates that currently carry an active manual position. */
    currentlyPinnedIds: readonly string[];
}): PrefixCanonicalPlan {
    const desiredOrder = planListMove(args.finalOrder, args.movedId, args.target);
    const positionOf = new Map(desiredOrder.map((id, i) => [id, i + 1]));

    // k must cover every row that carries manual intent: the one just moved, and every row already
    // pinned. Anything shallower would leave a pin outside the prefix, where its ordinal would have
    // to contend with natural rank again — the exact contention this model exists to remove.
    let prefixDepth = positionOf.get(args.movedId) ?? 0;
    for (const id of args.currentlyPinnedIds) {
        const at = positionOf.get(id);
        if (at != null && at > prefixDepth) prefixDepth = at;
    }

    const ordinals = new Map<string, number>();
    for (let i = 0; i < prefixDepth && i < desiredOrder.length; i += 1) {
        ordinals.set(desiredOrder[i]!, i + 1);
    }

    // A pin outside the prefix is not merely redundant — it would be seated by an ordinal that no
    // longer describes a position, so it must be released rather than left behind.
    const releasedIds = args.currentlyPinnedIds.filter((id) => !ordinals.has(id));

    const resolved = resolveOrderFromOrdinals(args.finalOrder, ordinals);
    return {
        desiredOrder,
        ordinals,
        releasedIds,
        reproduces: resolved.length === desiredOrder.length && resolved.every((id, i) => id === desiredOrder[i]),
    };
}
