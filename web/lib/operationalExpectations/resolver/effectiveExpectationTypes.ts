/**
 * Effective Expectation Resolver — types (P1 · Wave D · D1).
 *
 * The Effective Expectation Resolver is the INTERNAL P1 primitive that realizes
 * P1's frozen `Provides: "the ledger read/query surface (expectation assertions +
 * lineage)"` (Engineering Realization §13). It folds the already-shipped,
 * append-only `operational_expectations` ledger rows into the EFFECTIVE
 * expectation at an as-of coordinate. It is NOT the P3 "generalized evaluation
 * engine" (Judgment) — it never compares against Facts, never derives a gap, and
 * never invokes a consumer.
 *
 * Boundary (program-owner ratified, this Wave D scope):
 *   - Realizes REVISION (re-plan forward; System Design §4.3) and CORRECTION
 *     (never-valid unwind on the current-knowledge axis; §4.4) ONLY.
 *   - Cancellation and replacement effectivity remain UNRATIFIED — the resolver
 *     FAILS CLOSED on them (never infers, aliases, or partially resolves).
 *   - Pure: no DB IO, no system clock, no writes. Time is an INPUT.
 *   - `predecessor.valid_to` / `temporal_frame` are NEVER mutated; the effective
 *     window is DERIVED here on read (append-only is absolute).
 *
 * This module is INTERNAL to the P1 package. It is deliberately NOT re-exported
 * as a new Stable Public Interface or a universal downstream dependency.
 */

import type {
    ExpectationAuthorClass,
    ExpectationStanding,
    ExpectationTransitionType,
    ExpectationVerb,
    OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";

/**
 * An injected ledger row — exactly the columns the resolver reads from an
 * already-shipped `operational_expectations` SELECT. `snake_case` mirrors the
 * table so a caller passes query rows directly; the resolver performs NO IO and
 * reads NO facet it does not need for lineage/temporal/standing resolution.
 */
export interface ExpectationLedgerRow {
    id: string;
    org_id: string;
    /** Lineage root (a `create` roots itself; null is treated as the row's own id). */
    lineage_root_id: string | null;
    /** The immediate predecessor a non-`create` act supersedes (by reference, never mutation). */
    supersedes_expectation_id: string | null;
    verb: ExpectationVerb;
    /** NULL on a `create`; one typed transition otherwise. */
    transition_type: ExpectationTransitionType | null;
    modality: OperationalModality;
    author_class: ExpectationAuthorClass;
    authority_key: string;
    standing: ExpectationStanding;
    subject_kind: string;
    /** Valid-time (business/effective time) — author-supplied. */
    valid_from: string;
    valid_to: string | null;
    /** Recorded/transaction time — server-assigned, immutable. */
    authored_at: string;
}

/**
 * The two-axis as-of coordinate.
 *   - `validTime` — the valid-time (business time) effectivity is evaluated at.
 *   - `knownAt`   — the transaction-time axis. When set, ONLY rows authored at or
 *                   before it are considered ("as-known-at-T", audit). When
 *                   null/undefined it is "as-of-now" (all rows; corrections
 *                   absorbed).
 */
export interface AsOfCoordinate {
    validTime: string;
    knownAt?: string | null;
}

/** A single-lineage resolution query. Org + lineage isolation are enforced. */
export interface EffectiveExpectationQuery {
    orgId: string;
    lineageRootId: string;
    asOf: AsOfCoordinate;
    /**
     * Ids of expectations for which a Ratification Act exists. Passed straight to
     * `resolveEffectiveStanding` — the resolver does NOT reproduce Standing logic.
     */
    ratifiedExpectationIds?: ReadonlySet<string>;
}

/** A set-level query (org isolation; every lineage resolved independently). */
export interface EffectiveExpectationSetQuery {
    orgId: string;
    asOf: AsOfCoordinate;
    ratifiedExpectationIds?: ReadonlySet<string>;
}

/**
 * The internal derived result — the effective expectation at the coordinate. The
 * effective window (`effectiveFrom`/`effectiveTo`) is DERIVED by the fold, never
 * stored. This is an internal P1 shape, not an exported contract.
 */
export interface EffectiveExpectation {
    orgId: string;
    lineageRootId: string;
    /** The authored row that is effective at the coordinate. */
    effectiveExpectationId: string;
    modality: OperationalModality;
    authorityKey: string;
    authorClass: ExpectationAuthorClass;
    subjectKind: string;
    /** Standing derived via resolveEffectiveStanding (reused, not reproduced). */
    effectiveStanding: ExpectationStanding;
    /** DERIVED effective window at read time (NOT a stored/reshaped valid_to). */
    effectiveFrom: string;
    effectiveTo: string | null;
    /** The coordinate this result was resolved at (normalized). */
    asOf: { validTime: string; knownAt: string | null };
    /** Provenance: the authored row ids in the resolved lineage, transaction-time order. */
    lineagePath: string[];
}

/**
 * A typed fail-closed result for an UNRATIFIED transition (cancellation or
 * replacement). Carries only the context needed to identify the offending act —
 * no database or security-sensitive internals.
 */
export interface UnsupportedTransitionFailure {
    kind: "unsupported_transition";
    transitionType: ExpectationTransitionType;
    expectationId: string;
    lineageRootId: string;
}

/** The outcome of resolving one lineage. */
export type EffectiveExpectationResolution =
    | { kind: "resolved"; effective: EffectiveExpectation }
    | { kind: "none" }
    | UnsupportedTransitionFailure;

/**
 * The transitions whose EFFECTIVITY this resolver realizes. Program-owner
 * ratified for this Wave D scope: `revision` (D2) and `correction` (D3).
 * `cancellation` and `replacement` are deliberately ABSENT — their effectivity
 * is UNRATIFIED and MUST fail closed (see resolveEffectiveExpectation.ts).
 */
export const RATIFIED_TRANSITIONS: ReadonlySet<ExpectationTransitionType> = new Set<ExpectationTransitionType>([
    "revision",
    "correction",
]);
