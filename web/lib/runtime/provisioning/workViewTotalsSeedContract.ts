/**
 * THE WU-03 SEED CONTRACT — the half that may cross to the browser.
 *
 * Deliberately NOT `server-only`, and deliberately importing nothing that is. The document
 * resolves these counts on the server, but the client has to decide whether a given seed answers
 * ITS question, and that decision needs the shape and the signature rule — not the resolver.
 *
 * This file exists because the first version did not. `matchWorkViewTotalsSeed` imported
 * `buildConfiguredViewSignature` as a VALUE from the server-only resolver, which pulled
 * `lib/queues/evaluateWorkViewTotalsForGroup` and the whole Supabase graph into the client bundle:
 *
 *     'server-only' cannot be imported from a Client Component module.
 *
 * A type-only import would have been erased and caused nothing; a value import is a real edge. The
 * rule this repository already states — CONTRACTS may cross to the browser, SERVER
 * IMPLEMENTATIONS may not — is enforced here by keeping the crossable half in a module that has
 * nothing server-side to drag with it.
 */

/*
 * TYPE-ONLY, therefore erased. The rule this file enforces is about VALUE imports reaching the
 * browser bundle; a `import type` emits nothing at all, so the diagnostic shape can be named from
 * its owner rather than copied here and left to drift from it.
 */
import type { ChildMembershipBatchMeasurement } from "@/lib/runtime/provisioning/childGrainMembership";

/** One configured view's count, as both the endpoint and the seed report it. */
export type WorkViewTotalRow = {
    workUnitId: string;
    queueKey: string;
    workViewId: string;
    /** Null when unknown. A known zero is `count: 0, known: true` and stays zero. */
    count: number | null;
    /** False means UNKNOWN — never an authoritative zero. */
    known: boolean;
};

/**
 * Accumulated spans and cardinalities from the count evaluation.
 *
 * When the caller runs groups concurrently these are SUMS OF CONCURRENT WORK and do not add to the
 * caller's wall.
 */
export type WorkViewTotalsSpans = {
    child_counts: number;
    population: number;
    epp: number;
    tours: number;
    aggregate: number;
    views: number;
    child_views: number;
    lane_views: number;
    unknown_views: number;
    /**
     * One entry per group that had child lenses: which lenses ran, in which membership mode, what
     * each acquisition cost and at what cardinality. Diagnostic only — no predicate reads it.
     *
     * `child_counts` alone says the child lenses cost 1.5s. It cannot say whether that is one
     * expensive projection or three copies of the same reads, and those have opposite repairs.
     */
    child_batches: ChildMembershipBatchMeasurement[];
};

export function emptyWorkViewTotalsSpans(): WorkViewTotalsSpans {
    return {
        child_counts: 0,
        population: 0,
        epp: 0,
        tours: 0,
        aggregate: 0,
        views: 0,
        child_views: 0,
        lane_views: 0,
        unknown_views: 0,
        child_batches: [],
    };
}

/**
 * What a client must match before it may use a seed.
 *
 * `configuredViewSignature` binds view IDENTITIES, so a reorder produces the SAME signature
 * (reordering changes no count) while an add, a remove or a rename produces a different one.
 * Binding by array position, or by cardinality, would let configuration N satisfy N+1 whenever the
 * counts happened to line up.
 */
export type WorkViewTotalsSeedIdentity = {
    orgId: string;
    /** The surface work unit the document answered for. */
    hostWorkUnitId: string;
    /**
     * The site/location scope the counts were computed under. The document composes with no
     * workspace site filter, so this is null; a site-filtered operator MUST NOT consume it.
     */
    selectedSiteId: string | null;
    /** Sorted configured Work View identities, joined. Identity, never position. */
    configuredViewSignature: string;
};

export type WorkViewTotalsSeed =
    | {
          status: "resolved";
          identity: WorkViewTotalsSeedIdentity;
          /** One row per configured view that had a canonical count location. */
          totals: WorkViewTotalRow[];
          spans: WorkViewTotalsSpans;
      }
    | {
          /**
           * The seed could not answer; the client issues its canonical fallback exactly as it did
           * before the seed existed. UNAVAILABLE IS NEVER ZERO — which is why this shape carries
           * no `totals` at all, rather than an empty list something could read as authoritative.
           */
          status: "unavailable";
          reason: string;
      };

/** The one derivation of the signature, shared by the resolver and the client matcher. */
export function buildConfiguredViewSignature(viewIds: readonly string[]): string {
    return [...new Set(viewIds.map((v) => v.trim()).filter(Boolean))].sort().join(",");
}
