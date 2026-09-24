/**
 * ONE OPERATION, ONE REQUEST, HOWEVER MANY CALLERS ASK FOR IT.
 *
 * ── WHY THIS EXISTS ──
 *
 * Measured at the fetch boundary on deployed staging: opening Financials Details issued two
 * identical `financials/card` requests 48ms apart, for the same account, overlapping — the second
 * reported `identicalInFlight: 1`. Their stacks named two different and equally legitimate callers
 * of one function:
 *
 *   requestIdleCallback.timeout   the prewarm, which predicts the operator's ask
 *   the React commit path         the same effect's "asked for: now" branch, once Details opened
 *
 * Neither caller is wrong. The prewarm exists so the operator never waits for what was
 * predictable, and the click must not depend on a prediction having already landed. What was wrong
 * is that asking twice ISSUED twice: two ~2.4s reads racing, each slower for the contention.
 *
 * ── WHAT THIS IS, AND IS NOT ──
 *
 * It is a slot holding the ONE operation currently in the air, keyed by the caller's own key, and
 * cleared the instant that operation settles. A second ask for the same key awaits the first
 * rather than starting another.
 *
 * It is NOT a cache. It stores no result, survives no operation, and answers nothing once the
 * work has finished — the next ask starts fresh work. Nothing here holds financial truth between
 * operations, which is the line a performance repair on a money surface may not cross.
 */
export type InFlightCoalescer<T> = {
    /** Start `work` for `key`, or join the operation already running for that same key. */
    run(key: string, work: () => Promise<T>): Promise<T>;
    /** Whether an operation is in the air right now, for tests and diagnostics. */
    inFlightKey(): string | null;
};

export function createInFlightCoalescer<T>(): InFlightCoalescer<T> {
    let slot: { key: string; promise: Promise<T> } | null = null;
    return {
        run(key, work) {
            if (slot && slot.key === key) return slot.promise;
            /*
             * A DIFFERENT KEY REPLACES THE SLOT RATHER THAN JOINING IT. Two accounts are two
             * operations, and coalescing them would be the defect this file exists to prevent
             * wearing a different face — one family's answer handed to another's request.
             */
            const promise = work().finally(() => {
                if (slot?.promise === promise) slot = null;
            });
            slot = { key, promise };
            return promise;
        },
        inFlightKey: () => slot?.key ?? null,
    };
}
