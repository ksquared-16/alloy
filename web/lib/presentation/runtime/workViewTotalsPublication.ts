"use client";

/**
 * THE WORK UNIT OWNER PUBLISHES ITS RESOLVED WORK VIEW TOTALS; THE PERSISTENT NAV OBSERVES THEM.
 *
 * WHY THIS EXISTS, AND WHY THE OBVIOUS THING FAILED.
 *
 * The nav asks the same Work View count question the Work Unit surface asks. It used to get the
 * answer for free by deduping against the surface's request; the WU-03 document seed retired that
 * request and the nav became the sole requester (~1.5s of server work per navigation, issued well
 * after first-order finality).
 *
 * The first repair had the nav PEEK the provisioning cache entry the surface consumes. It was
 * measured deployed and hit 0 of 6 times, for a reason that is now proven rather than suspected:
 *
 *   1. the route surface commits FIRST (the append-only seed diagnostic showed
 *      work-unit-settlement before sidebar in 6 of 6 samples);
 *   2. it consumes via `consumeFreshProvisioningForRoute`, which falls back to the seed's BASE key
 *      and DELETES the entry (`consumeFreshProvisioning` is consume-once);
 *   3. the nav sits behind `<Suspense>`, so its commit is deferred behind the route.
 *
 * So the owner had always already consumed the entry before the nav looked. Peek-after-consume
 * returns nothing — which the peek suite's own gate asserts as correct. The primitive was right;
 * depending on that ordering was wrong.
 *
 * THIS MODULE INVERTS THE DEPENDENCY. Instead of the nav racing to read what the owner consumes,
 * the OWNER publishes what it resolved and the nav observes it. The ordering that defeated the
 * peek is now the mechanism that makes this correct: because the owner reliably commits first, a
 * render-phase `announce` is guaranteed to be visible to the nav by the time the nav's effect
 * runs. That is what lets the nav tell "an owner is coming, wait for it" apart from "no owner on
 * this route, fall back now" WITHOUT a timeout and without a permanent pending state.
 *
 * OWNERSHIP IS NOT MOVED. The Work Unit surface remains the canonical evaluator; this carries the
 * answer it already computed. The nav performs no evaluation, holds no predicate, and re-validates
 * what it receives through the EXISTING matcher — the published value is shaped as the existing
 * `WorkViewTotalsSeed`, so no new semantics are introduced and no authorization verdict travels.
 */

import { createWarmCache } from "@/lib/runtime/warmCache";
import type { WorkViewTotalsSeed } from "@/lib/runtime/provisioning/workViewTotalsSeedContract";

/**
 * `absent`  — no Work Unit owner announced for this route; an observer must fall back NOW.
 * `pending` — an owner has announced and will publish a terminal value; an observer must WAIT.
 * `settled` — the owner's terminal answer. `seed` may be null, meaning the owner has no
 *             authoritative totals to share and the observer should fall back.
 *
 * `pending` is what removes the need for a timeout, and `absent` is what removes the risk of
 * waiting forever on a route that has no owner at all.
 */
export type WorkViewTotalsPublication =
    | { phase: "absent" }
    | { phase: "pending" }
    | {
          phase: "settled";
          seed: WorkViewTotalsSeed | null;
          orgId: string | null;
          hostWorkUnitId: string | null;
      };

const ABSENT: WorkViewTotalsPublication = { phase: "absent" };

/*
 * Built on the codebase's existing warm-cache primitive rather than a bespoke store: it already
 * provides the exact seam this needs — `set` (publish without a fetch), `subscribe`, and a
 * reference-stable `getState` for `useSyncExternalStore`.
 *
 * This is a PUBLISH-ONLY cache. Nothing ever calls `warm()`, so the fetcher is unreachable; it
 * throws rather than inventing a second acquisition path, because a publication that could fetch
 * would be a second evaluator — exactly what this design exists to avoid. A gate pins this.
 */
const publication = createWarmCache<void, WorkViewTotalsPublication>({
    keyOf: () => "current-route",
    fetcher: () => {
        throw new Error(
            "workViewTotalsPublication is publish-only: the Work Unit owner is the sole evaluator.",
        );
    },
});

/**
 * Render-phase. Declares "a Work Unit owner is mounted on this route and will publish".
 *
 * Called during render, like `ProvisioningAnswerSeed`'s seed write, so it lands before ANY effect
 * — including the nav's. Idempotent: re-announcing while already pending or settled changes
 * nothing, so a re-render cannot discard a terminal answer.
 */
export function announceWorkViewTotalsOwner(): void {
    if (publication.get() === null) publication.set(undefined, { phase: "pending" });
}

/** The owner's terminal answer for this route. A null seed means "fall back", never "zero". */
export function publishWorkViewTotals(value: {
    seed: WorkViewTotalsSeed | null;
    orgId: string | null;
    hostWorkUnitId: string | null;
}): void {
    publication.set(undefined, { phase: "settled", ...value });
}

/**
 * The owner has left. The next route's owner announces its own; an observer that runs in between
 * sees `absent` and falls back rather than reusing the previous work unit's answer.
 */
export function clearWorkViewTotalsPublication(): void {
    publication.invalidate();
}

export function subscribeWorkViewTotalsPublication(listener: () => void): () => void {
    return publication.subscribe(listener);
}

export function getWorkViewTotalsPublication(): WorkViewTotalsPublication {
    return publication.get() ?? ABSENT;
}

/** Server render has no publication; a constant keeps `useSyncExternalStore` stable. */
export function getWorkViewTotalsPublicationServerSnapshot(): WorkViewTotalsPublication {
    return ABSENT;
}

export function resetWorkViewTotalsPublicationForTests(): void {
    publication.reset();
}
