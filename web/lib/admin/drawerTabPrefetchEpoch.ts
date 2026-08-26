/**
 * EPOCH-BOUND SCHEDULING for the opportunity drawer's tab prefetch.
 *
 * The scheduler used to depend on someone remembering to call
 * `invalidateOpportunityDrawerTabPrefetch`. Nobody did — it had zero production callers, so its
 * AbortController only ever fired in tests. A queued eight-second read therefore outlived the
 * subject that armed it, and once a subject had been armed its slot was never released, so the
 * "already armed" check refused to re-arm it for the rest of the session.
 *
 * Scattering cleanup calls at every place attention can move (subject change, Work Unit change,
 * return to Workspace, unmount, a newer intent) would be the same bug waiting for the next call site
 * to be forgotten. So staleness is made IMPOSSIBLE instead of cleaned up:
 *
 *   - one owner declares the epoch it is preparing for, and releases it on teardown;
 *   - every scheduled job captures the epoch it was armed in;
 *   - a job may only run while its epoch is still current.
 *
 * A job from a superseded epoch cannot execute, whatever wakes it — an idle callback, a re-check
 * timer, or the bounded fallback expiring. That last one matters: a bound that lets stale work
 * through "because we waited long enough" is exactly the failure this replaces.
 *
 * The epoch is identified by its SUBJECT as well as its number, so a subject that is re-entered
 * later is a genuinely new epoch rather than a revived old one.
 */

export type DrawerTabPrefetchEpoch = {
    readonly id: number;
    readonly subjectId: string;
};

let currentEpoch: DrawerTabPrefetchEpoch | null = null;
let nextEpochId = 1;

/** Listeners fired when an epoch is superseded, so in-flight work can be aborted at its owner. */
const supersededListeners = new Set<(epoch: DrawerTabPrefetchEpoch) => void>();

export function onDrawerTabPrefetchEpochSuperseded(
    listener: (epoch: DrawerTabPrefetchEpoch) => void,
): () => void {
    supersededListeners.add(listener);
    return () => supersededListeners.delete(listener);
}

function supersede(epoch: DrawerTabPrefetchEpoch | null): void {
    if (!epoch) return;
    for (const listener of [...supersededListeners]) {
        try {
            listener(epoch);
        } catch {
            /* a listener must never break the lifecycle */
        }
    }
}

/**
 * Declare the subject this surface is preparing for. Supersedes whatever came before — which is
 * what makes subject change, Work Unit change, a return to the Workspace, and a newer intent all
 * one mechanism rather than four call sites.
 */
export function beginDrawerTabPrefetchEpoch(subjectId: string): DrawerTabPrefetchEpoch {
    const id = subjectId.trim();
    const previous = currentEpoch;
    currentEpoch = { id: nextEpochId, subjectId: id };
    nextEpochId += 1;
    if (previous && previous.id !== currentEpoch.id) supersede(previous);
    return currentEpoch;
}

/**
 * The owner went away (unmount, or it moved on). Releases ONLY if this epoch is still the current
 * one — a late teardown from a superseded owner must not cancel the epoch that replaced it.
 */
export function endDrawerTabPrefetchEpoch(epoch: DrawerTabPrefetchEpoch): void {
    if (!currentEpoch || currentEpoch.id !== epoch.id) return;
    currentEpoch = null;
    supersede(epoch);
}

export function currentDrawerTabPrefetchEpoch(): DrawerTabPrefetchEpoch | null {
    return currentEpoch;
}

/**
 * May a job armed in `epoch` still run? False once anything has superseded it — including "no owner
 * at all", because an unmounted surface has no pending work worth doing.
 *
 * `null` means the job was armed with no declared owner. Those keep the pre-epoch behaviour and are
 * allowed to run: this contract narrows stale work, it does not silently disable preparation for
 * callers that have not adopted it.
 */
export function isDrawerTabPrefetchEpochCurrent(epoch: DrawerTabPrefetchEpoch | null): boolean {
    if (epoch === null) return true;
    return currentEpoch !== null && currentEpoch.id === epoch.id;
}

/** @internal test seam */
export function resetDrawerTabPrefetchEpochForTests(): void {
    currentEpoch = null;
    nextEpochId = 1;
    supersededListeners.clear();
}
