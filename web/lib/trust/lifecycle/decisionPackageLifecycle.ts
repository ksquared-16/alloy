/**
 * Decision Package lifecycle projection.
 *
 * ONE deterministic projection over an immutable Decision Package plus its
 * append-only observations:
 *
 *   package + zero or more observations + projection time
 *     → exactly one projection, or exactly one structured error
 *
 * The function is total and pure. It reads no database, mutates neither input,
 * and depends on neither row order nor import order — ordering comes from the
 * canonical `(observed_at, id)` sort, never from the array it was handed.
 *
 * Dimensions are kept SEPARATE rather than collapsed into one status, because
 * the interesting cases genuinely carry two facts at once: a package can be
 * accepted AND expired, or accepted AND superseded. `disposition` is a summary
 * for callers that need one value; `review`, `execution`, `expiry` and
 * `supersession` remain independently readable.
 *
 * Contradictory persisted history is an ERROR, never a silent choice. A package
 * that is both accepted and rejected is bad data, and picking whichever row was
 * read last would launder a defect into a lifecycle.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 020
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.4
 */

import type {
    ExecutionResult,
    ExpiryKind,
    LifecycleObservationRecord,
    LifecycleSubjectPackage,
    SupersedingPackageRef,
    TrustObservationKind,
} from "@/lib/trust/lifecycle/lifecycleObservation";
import {
    isKnownObservationKind,
    orderObservationsCanonically,
    parseExecutionResult,
    parseExpiryKind,
    readStringDetail,
} from "@/lib/trust/lifecycle/lifecycleObservation";
import {
    parseSupersessionSource,
    type SupersessionSource,
} from "@/lib/trust/lifecycle/supersessionLineage";

// ---------------------------------------------------------------------------
// Projection shape
// ---------------------------------------------------------------------------

/**
 * The summary axis, in strict precedence order (highest first).
 *
 * Precedence answers one question: *what most decides whether an operator can
 * still act on this recommendation?* Execution outranks standing because a
 * change to the world is a stronger fact than whether the recommendation is
 * still current.
 */
export const LIFECYCLE_DISPOSITIONS = [
    /** The package carries no recommendation — a refusal was never actionable. */
    "not_actionable",
    /** An execution authority acted and reported failure. */
    "execution_failed",
    /** An execution authority acted successfully. */
    "executed",
    /** A newer Decision Package replaced this one. */
    "superseded",
    /** The window closed before the recommendation was acted on. */
    "expired",
    "rejected",
    /** Accepted and awaiting execution. */
    "accepted",
    "deferred",
    /** Shown to an operator, not yet decided. */
    "presented",
    /** Created, no observation yet. */
    "proposed",
] as const;

export type LifecycleDisposition = (typeof LIFECYCLE_DISPOSITIONS)[number];

export const LIFECYCLE_REVIEW_STATES = [
    "unreviewed",
    "presented",
    "deferred",
    "accepted",
    "rejected",
    "overridden",
    "modified",
] as const;
export type LifecycleReviewState = (typeof LIFECYCLE_REVIEW_STATES)[number];

/**
 * Execution is never inferred from acceptance.
 *
 * `not_bound` means no canonical execution record exists — which is the state
 * of every package today, because execution binding is Slice 0.5. It says
 * "unknown", not "did not happen".
 */
export const LIFECYCLE_EXECUTION_STATES = ["not_bound", "executed", "failed"] as const;
export type LifecycleExecutionState = (typeof LIFECYCLE_EXECUTION_STATES)[number];

/** Actor and time evidence for one projected dimension. */
export type LifecycleEvidence = {
    readonly observation_id: string;
    readonly at_iso: string;
    readonly actor_type: "operator" | "system" | "automation";
    readonly actor_id: string | null;
    readonly channel: string;
};

export type LifecycleReview = {
    readonly state: LifecycleReviewState;
    readonly evidence: LifecycleEvidence | null;
};

export type LifecycleExecution = {
    readonly state: LifecycleExecutionState;
    /** Opaque reference supplied by the execution authority. Evidence, never an instruction. */
    readonly reference: string | null;
    readonly result: ExecutionResult | null;
    readonly evidence: LifecycleEvidence | null;
};

export type LifecycleExpiry = {
    readonly expired: boolean;
    readonly kind: ExpiryKind | null;
    readonly evidence: LifecycleEvidence | null;
};

export type LifecycleSupersession = {
    readonly superseded: boolean;
    readonly superseding_package_id: string | null;
    readonly reason: string | null;
    /**
     * Where the replacing authority lives.
     *
     * `replacement_decision_package` names a successor package;
     * `external_authority_decision` records that an authority outside Trust —
     * today a Processing operator decision — replaced the judgment, in which
     * case `superseding_package_id` is legitimately `null` and
     * {@link LifecycleSupersession.superseding_reference} carries the evidence.
     *
     * `null` only for history written before the source was recorded.
     */
    readonly source: SupersessionSource | null;
    /** Opaque durable reference into the replacing authority's own record. */
    readonly superseding_reference: string | null;
    /**
     * Whether the superseding package was supplied so its org and lineage could
     * be checked. `false` means the claim was taken at face value and the
     * cross-org and cycle checks did not run.
     *
     * Always `false` for an external-authority supersession: there is no
     * successor package to verify, by construction rather than by omission.
     */
    readonly lineage_verified: boolean;
    readonly evidence: LifecycleEvidence | null;
};

export type DecisionPackageLifecycleProjection = {
    readonly package_id: string;
    readonly org_id: string;
    readonly projected_at_iso: string;

    readonly disposition: LifecycleDisposition;
    /** One sentence naming why this disposition won. */
    readonly reason: string;

    readonly review: LifecycleReview;
    readonly execution: LifecycleExecution;
    readonly expiry: LifecycleExpiry;
    readonly supersession: LifecycleSupersession;

    /** Whether an operator can still act. False for every terminal disposition. */
    readonly operator_action_available: boolean;

    readonly latest_observation: LifecycleEvidence | null;
    readonly observation_count: number;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const LIFECYCLE_PROJECTION_ERROR_CODES = [
    "OBSERVATION_PACKAGE_MISMATCH",
    "OBSERVATION_ORG_MISMATCH",
    "UNKNOWN_OBSERVATION_KIND",
    "CONTRADICTORY_REVIEW",
    "CONTRADICTORY_EXECUTION_RESULT",
    "CONTRADICTORY_SUPERSESSION",
    "CONTRADICTORY_EXPIRY",
    "SELF_SUPERSESSION",
    "CROSS_ORG_SUPERSESSION",
    "SUPERSESSION_CYCLE",
    "MISSING_SUPERSEDING_PACKAGE_ID",
    /**
     * A supersession attributed to an authority outside Trust that names no
     * durable reference into that authority's own record. "Something replaced
     * it" without evidence is not lineage.
     */
    "MISSING_SUPERSESSION_REFERENCE",
    "MISSING_EXPIRY_KIND",
] as const;

export type LifecycleProjectionErrorCode = (typeof LIFECYCLE_PROJECTION_ERROR_CODES)[number];

export type LifecycleProjectionError = {
    readonly code: LifecycleProjectionErrorCode;
    readonly detail: string;
    /** Observation ids implicated, so bad data can be found without a re-read. */
    readonly observation_ids: readonly string[];
};

/** Thrown only by {@link requireDecisionPackageLifecycle}. */
export class DecisionPackageLifecycleError extends Error {
    readonly code: LifecycleProjectionErrorCode;
    readonly observation_ids: readonly string[];

    constructor(error: LifecycleProjectionError) {
        super(`${error.code}: ${error.detail}`);
        this.name = "DecisionPackageLifecycleError";
        this.code = error.code;
        this.observation_ids = error.observation_ids;
    }
}

export type LifecycleProjectionResult =
    | { readonly ok: true; readonly projection: DecisionPackageLifecycleProjection }
    | { readonly ok: false; readonly error: LifecycleProjectionError };

export type ProjectDecisionPackageLifecycleInput = {
    readonly package: LifecycleSubjectPackage;
    readonly observations: readonly LifecycleObservationRecord[];
    /** Projection time. Supplied, never read from the clock, so projection is reproducible. */
    readonly projectedAtIso: string;
    /** Packages claimed to supersede the subject, keyed by id. Enables lineage checks. */
    readonly supersedingPackages?: Readonly<Record<string, SupersedingPackageRef>>;
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

const REVIEW_KIND_TO_STATE: Readonly<Record<string, LifecycleReviewState>> = {
    presented: "presented",
    deferred: "deferred",
    accepted: "accepted",
    rejected: "rejected",
    overridden: "overridden",
    modified: "modified",
};

/** Review states that terminate review. Two different ones cannot both be true. */
const TERMINAL_REVIEW_STATES: ReadonlySet<LifecycleReviewState> = new Set([
    "accepted",
    "rejected",
    "overridden",
]);

/** Later review states win over earlier ones within the non-terminal set. */
const REVIEW_RANK: Readonly<Record<LifecycleReviewState, number>> = {
    unreviewed: 0,
    presented: 1,
    deferred: 2,
    modified: 3,
    accepted: 4,
    rejected: 4,
    overridden: 4,
};

function evidenceOf(o: LifecycleObservationRecord): LifecycleEvidence {
    return {
        observation_id: o.id,
        at_iso: o.observed_at_iso,
        actor_type: o.observed_by_actor_type,
        actor_id: o.observed_by_actor_id,
        channel: o.channel,
    };
}

function fail(
    code: LifecycleProjectionErrorCode,
    detail: string,
    observation_ids: readonly string[] = [],
): LifecycleProjectionResult {
    return { ok: false, error: { code, detail, observation_ids } };
}

/**
 * Projects one Decision Package's lifecycle. Total: every input yields either a
 * projection or a structured error, and never an exception.
 */
export function projectDecisionPackageLifecycle(
    input: ProjectDecisionPackageLifecycleInput,
): LifecycleProjectionResult {
    const pkg = input.package;
    const ordered = orderObservationsCanonically(input.observations);

    // ---- 1. every observation must belong to this package, in this org ------
    for (const o of ordered) {
        if (o.package_id !== pkg.id) {
            return fail(
                "OBSERVATION_PACKAGE_MISMATCH",
                `Observation ${o.id} references package ${o.package_id}, not ${pkg.id}.`,
                [o.id],
            );
        }
        if (o.org_id !== pkg.org_id) {
            return fail(
                "OBSERVATION_ORG_MISMATCH",
                `Observation ${o.id} is scoped to org ${o.org_id}, but the package belongs to ${pkg.org_id}.`,
                [o.id],
            );
        }
        if (!isKnownObservationKind(o.observation_kind)) {
            // Fail closed. An unrecognised kind may carry meaning this projection
            // does not implement, so guessing would be worse than refusing.
            return fail(
                "UNKNOWN_OBSERVATION_KIND",
                `Observation ${o.id} carries unknown kind "${o.observation_kind}". The vocabulary is closed.`,
                [o.id],
            );
        }
    }

    const byKind = new Map<TrustObservationKind, LifecycleObservationRecord[]>();
    for (const o of ordered) {
        const kind = o.observation_kind as TrustObservationKind;
        const bucket = byKind.get(kind);
        if (bucket) bucket.push(o);
        else byKind.set(kind, [o]);
    }
    /** First occurrence in canonical order. A fact cannot un-happen or re-happen. */
    const firstOf = (kind: TrustObservationKind) => byKind.get(kind)?.[0] ?? null;

    // ---- 2. review ----------------------------------------------------------
    const terminalReviewObs = ordered.filter(
        (o) => TERMINAL_REVIEW_STATES.has(REVIEW_KIND_TO_STATE[o.observation_kind] ?? "unreviewed"),
    );
    const distinctTerminalReviews = new Set(terminalReviewObs.map((o) => REVIEW_KIND_TO_STATE[o.observation_kind]!));
    if (distinctTerminalReviews.size > 1) {
        return fail(
            "CONTRADICTORY_REVIEW",
            `Package ${pkg.id} carries contradictory terminal review observations (${[...distinctTerminalReviews]
                .sort()
                .join(", ")}). A package cannot have been both; one of these rows is invalid history.`,
            terminalReviewObs.map((o) => o.id),
        );
    }

    let review: LifecycleReview = { state: "unreviewed", evidence: null };
    for (const o of ordered) {
        const state = REVIEW_KIND_TO_STATE[o.observation_kind];
        if (!state) continue;
        // Highest-ranked state wins; within equal rank the canonical-first
        // observation is the evidence, so duplicates are idempotent.
        if (REVIEW_RANK[state] > REVIEW_RANK[review.state]) {
            review = { state, evidence: evidenceOf(o) };
        }
    }

    // ---- 3. execution -------------------------------------------------------
    const outcomeObs = byKind.get("outcome") ?? [];
    const outcomeResults = new Set(outcomeObs.map((o) => parseExecutionResult(o.detail.result)).filter(Boolean));
    if (outcomeResults.size > 1) {
        return fail(
            "CONTRADICTORY_EXECUTION_RESULT",
            `Package ${pkg.id} carries outcome observations reporting different results (${[...outcomeResults]
                .sort()
                .join(", ")}).`,
            outcomeObs.map((o) => o.id),
        );
    }
    const executedObs = firstOf("executed");
    const firstOutcome = outcomeObs[0] ?? null;
    const declaredResult = firstOutcome ? parseExecutionResult(firstOutcome.detail.result) : null;

    let execution: LifecycleExecution = { state: "not_bound", reference: null, result: null, evidence: null };
    if (declaredResult === "failed") {
        execution = {
            state: "failed",
            reference: firstOutcome!.execution_reference,
            result: "failed",
            evidence: evidenceOf(firstOutcome!),
        };
    } else if (executedObs) {
        execution = {
            state: "executed",
            reference: executedObs.execution_reference,
            result: declaredResult ?? "succeeded",
            evidence: evidenceOf(executedObs),
        };
    } else if (declaredResult === "succeeded") {
        execution = {
            state: "executed",
            reference: firstOutcome!.execution_reference,
            result: "succeeded",
            evidence: evidenceOf(firstOutcome!),
        };
    }

    // ---- 4. expiry ----------------------------------------------------------
    const expiredObs = byKind.get("expired") ?? [];
    let expiry: LifecycleExpiry = { expired: false, kind: null, evidence: null };
    if (expiredObs.length > 0) {
        const kinds = new Set(expiredObs.map((o) => parseExpiryKind(o.detail.expiry_kind)));
        if (kinds.has(null)) {
            return fail(
                "MISSING_EXPIRY_KIND",
                `An expired observation on package ${pkg.id} declares no recognised detail.expiry_kind. The cause of an expiry must be auditable.`,
                expiredObs.filter((o) => parseExpiryKind(o.detail.expiry_kind) === null).map((o) => o.id),
            );
        }
        if (kinds.size > 1) {
            return fail(
                "CONTRADICTORY_EXPIRY",
                `Package ${pkg.id} carries expired observations declaring different expiry kinds (${[...kinds]
                    .sort()
                    .join(", ")}).`,
                expiredObs.map((o) => o.id),
            );
        }
        const first = expiredObs[0]!;
        expiry = { expired: true, kind: parseExpiryKind(first.detail.expiry_kind), evidence: evidenceOf(first) };
    }

    // ---- 5. supersession ----------------------------------------------------
    // A governed judgment stops being current in one of two ways: a newer
    // Decision Package replaced it, or an authority OUTSIDE Trust did. The second
    // is not a missing successor — it is a different kind of lineage, and it
    // carries a durable reference into the deciding authority instead of an
    // invented package id. Both are still exactly one claim per package.
    const supersededObs = byKind.get("superseded") ?? [];
    let supersession: LifecycleSupersession = {
        superseded: false,
        superseding_package_id: null,
        reason: null,
        source: null,
        superseding_reference: null,
        lineage_verified: false,
        evidence: null,
    };
    if (supersededObs.length > 0) {
        /** One claim key per observation. Two distinct keys is ambiguous lineage. */
        const claims = new Set<string>();
        for (const o of supersededObs) {
            const source = parseSupersessionSource(o.detail.supersession_source);
            const id = readStringDetail(o.detail, "superseding_package_id");
            const reference = readStringDetail(o.detail, "superseding_reference");

            if (source === "external_authority_decision") {
                if (!reference) {
                    return fail(
                        "MISSING_SUPERSESSION_REFERENCE",
                        `A superseded observation on package ${pkg.id} attributes supersession to an external authority but names no detail.superseding_reference. Lineage must be deterministic.`,
                        [o.id],
                    );
                }
                claims.add(`external\u001f${reference}`);
                continue;
            }
            // A replacement package, or history written before the source was
            // recorded. Either way a successor id is mandatory.
            if (!id) {
                return fail(
                    "MISSING_SUPERSEDING_PACKAGE_ID",
                    `A superseded observation on package ${pkg.id} names no detail.superseding_package_id. Lineage must be deterministic.`,
                    [o.id],
                );
            }
            claims.add(`package\u001f${id}`);
        }
        if (claims.size > 1) {
            return fail(
                "CONTRADICTORY_SUPERSESSION",
                `Package ${pkg.id} claims to be superseded by more than one authority (${[...claims]
                    .map((c) => c.replace("\u001f", ":"))
                    .sort()
                    .join(", ")}). Lineage would be ambiguous.`,
                supersededObs.map((o) => o.id),
            );
        }

        const first = supersededObs[0]!;
        const source = parseSupersessionSource(first.detail.supersession_source);
        const external = source === "external_authority_decision";
        const supersedingId = external ? null : readStringDetail(first.detail, "superseding_package_id");
        const reference = readStringDetail(first.detail, "superseding_reference");

        if (supersedingId === pkg.id) {
            return fail(
                "SELF_SUPERSESSION",
                `Package ${pkg.id} cannot supersede itself.`,
                supersededObs.map((o) => o.id),
            );
        }

        const successor = supersedingId ? input.supersedingPackages?.[supersedingId] ?? null : null;
        if (successor) {
            if (successor.org_id !== pkg.org_id) {
                return fail(
                    "CROSS_ORG_SUPERSESSION",
                    `Package ${pkg.id} (org ${pkg.org_id}) claims supersession by ${supersedingId} in org ${successor.org_id}. One organization may not narrate another's lineage.`,
                    supersededObs.map((o) => o.id),
                );
            }
            // The only cycle reachable without walking a graph: the successor
            // declares the subject as ITS predecessor while the subject declares
            // the successor as its own. One step is all this contract needs.
            if (pkg.supersedes_package_id === successor.id && successor.supersedes_package_id === pkg.id) {
                return fail(
                    "SUPERSESSION_CYCLE",
                    `Packages ${pkg.id} and ${supersedingId} declare each other as predecessor. Lineage must be acyclic.`,
                    supersededObs.map((o) => o.id),
                );
            }
        }

        supersession = {
            superseded: true,
            superseding_package_id: supersedingId,
            reason: readStringDetail(first.detail, "reason"),
            source,
            superseding_reference: reference,
            lineage_verified: successor !== null,
            evidence: evidenceOf(first),
        };
    }

    // ---- 6. disposition, by explicit precedence -----------------------------
    const recommended = pkg.outcome === "recommended";
    let disposition: LifecycleDisposition;
    let reason: string;

    if (!recommended) {
        disposition = "not_actionable";
        reason = `The package outcome is "${pkg.outcome}", so there is no recommendation to review, execute or expire.`;
    } else if (execution.state === "failed") {
        disposition = "execution_failed";
        reason = "An execution authority acted and reported failure. Execution evidence outranks review and standing.";
    } else if (execution.state === "executed") {
        disposition = "executed";
        reason = "An execution authority acted. A change to the world outranks whether the recommendation is still current.";
    } else if (supersession.superseded) {
        disposition = "superseded";
        reason =
            supersession.source === "external_authority_decision"
                ? `An authority outside Trust replaced this judgment before it was executed (${supersession.superseding_reference}).`
                : `A newer Decision Package (${supersession.superseding_package_id}) replaced this one before it was executed.`;
    } else if (expiry.expired) {
        disposition = "expired";
        reason = `The recommendation's window closed (${expiry.kind}) before it was executed.`;
    } else if (review.state === "rejected") {
        disposition = "rejected";
        reason = "An operator rejected the recommendation.";
    } else if (review.state === "accepted" || review.state === "overridden") {
        disposition = "accepted";
        reason =
            review.state === "overridden"
                ? "An operator overrode the recommendation, which terminates review without execution."
                : "The recommendation was accepted and is awaiting execution.";
    } else if (review.state === "deferred") {
        disposition = "deferred";
        reason = "An operator deferred the recommendation.";
    } else if (review.state === "presented" || review.state === "modified") {
        disposition = "presented";
        reason = "The recommendation was shown to an operator and has not been decided.";
    } else {
        disposition = "proposed";
        reason = "The package was created and no observation references it yet.";
    }

    // Overridden terminates review, so no further operator action is available.
    const operatorActionAvailable =
        recommended &&
        !expiry.expired &&
        !supersession.superseded &&
        execution.state === "not_bound" &&
        review.state !== "rejected" &&
        review.state !== "accepted" &&
        review.state !== "overridden";

    const latest = ordered.length > 0 ? evidenceOf(ordered[ordered.length - 1]!) : null;

    return {
        ok: true,
        projection: {
            package_id: pkg.id,
            org_id: pkg.org_id,
            projected_at_iso: input.projectedAtIso,
            disposition,
            reason,
            review,
            execution,
            expiry,
            supersession,
            operator_action_available: operatorActionAvailable,
            latest_observation: latest,
            observation_count: ordered.length,
        },
    };
}

/**
 * Projection or throw. Use where invalid persisted history is a defect the
 * caller cannot handle; prefer {@link projectDecisionPackageLifecycle} where it
 * can.
 */
export function requireDecisionPackageLifecycle(
    input: ProjectDecisionPackageLifecycleInput,
): DecisionPackageLifecycleProjection {
    const result = projectDecisionPackageLifecycle(input);
    if (!result.ok) throw new DecisionPackageLifecycleError(result.error);
    return result.projection;
}
