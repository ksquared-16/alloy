/**
 * Mapping an authoritative Processing commit result into bounded Trust evidence.
 *
 * Pure. No I/O, no clock. Processing owns this mapping because Processing owns
 * the outcome vocabulary being mapped.
 *
 * ## The mapping is at SUBJECT grain, not attempt grain
 *
 * An attempt-wide `partially_committed` says some operations committed and some
 * did not. A Decision Package is one SUBJECT's judgment. So the question a
 * package's evidence answers is not "did the attempt succeed" but **"did this
 * subject's contributing operations commit?"** — which is the only reading under
 * which a partial commit can be reported honestly rather than flattened into
 * success or into total failure.
 *
 * ```text
 * every contributing op committed  → executed
 * none committed                   → outcome, failed, subject_not_committed
 * some committed, some not         → outcome, failed, partial_commit   (never executed)
 * ```
 *
 * ## Processing has no infrastructure-failure state, and Trust must not invent one
 *
 * `AttemptOutcome` is `committed | partially_committed | failed |
 * preflight_rejected`. None of them distinguishes "the command runtime declined"
 * from "the transport died", and if the executor throws, no attempt row is
 * persisted at all — so there is no durable result to observe and this module is
 * never reached. Every failure it CAN see is therefore an operational refusal by
 * an authority that did return a verdict. Claiming `infrastructure_failure`
 * would assert knowledge Processing does not have, so the class is never emitted
 * from this source. The exact Processing outcome is carried verbatim in
 * `processing_outcome` instead, which loses nothing.
 */

import type { AttemptOutcome, CommitAttempt, OperationResult } from "../executor/executorTypes";
import type { ContributingPackage } from "./planPackageLineage";

/** How one subject's own contributing operations fared. */
export const SUBJECT_OPERATION_OUTCOMES = [
    "all_committed",
    "none_committed",
    "partially_committed",
] as const;
export type SubjectOperationOutcome = (typeof SUBJECT_OPERATION_OUTCOMES)[number];

/**
 * Why a subject produced no execution.
 *
 * Deliberately NOT Phase 0's `EXECUTION_FAILURE_CLASSES`: those distinguish
 * `command_refused` from `infrastructure_failure`, and Processing cannot tell
 * them apart. These are the distinctions Processing genuinely makes.
 */
export const PROCESSING_EXECUTION_FAILURE_CLASSES = [
    /** Preflight declined the plan. Nothing was attempted. */
    "preflight_rejected",
    /** The executor ran and this subject's operations did not commit. */
    "subject_not_committed",
    /** Some of this subject's operations committed and some did not. */
    "partial_commit",
] as const;
export type ProcessingExecutionFailureClass = (typeof PROCESSING_EXECUTION_FAILURE_CLASSES)[number];

export type ExecutionEvidence = {
    readonly packageId: string;
    readonly observationKind: "executed" | "outcome";
    readonly detail: Readonly<Record<string, string | number>>;
    /** One sentence naming why this evidence is what it is. */
    readonly reason: string;
};

/**
 * The evidence one commit attempt produces for one contributing package.
 *
 * Total: every attempt outcome yields exactly one piece of evidence per
 * contributing package. There is no branch that silently produces nothing,
 * because "we executed and recorded nothing" is the failure mode this slice
 * exists to remove.
 */
export function planPackageExecutionEvidence(input: {
    readonly attempt: CommitAttempt;
    readonly contributor: ContributingPackage;
}): ExecutionEvidence {
    const { attempt, contributor } = input;

    const base = {
        plan_id: attempt.planId,
        plan_version: attempt.planVersion,
        plan_content_hash: attempt.planContentHash,
        processing_outcome: attempt.outcome,
    } as const;

    // Preflight refused: the executor never ran, so no subject committed.
    if (attempt.outcome === "preflight_rejected") {
        return {
            packageId: contributor.packageId,
            observationKind: "outcome",
            reason: "Processing preflight declined the plan. Nothing was executed.",
            detail: {
                ...base,
                result: "failed",
                failure_class: "preflight_rejected" satisfies ProcessingExecutionFailureClass,
                contributing_operation_count: contributor.opIds.length,
                committed_operation_count: 0,
            },
        };
    }

    const subjectResults = attempt.operations.filter((r) => contributor.opIds.includes(r.opId));
    const committed = subjectResults.filter(isCommittedResult);
    const subjectOutcome = classifySubject(contributor.opIds.length, committed.length);

    if (subjectOutcome === "all_committed") {
        return {
            packageId: contributor.packageId,
            observationKind: "executed",
            reason: "Processing committed every operation derived from this governed judgment.",
            detail: {
                ...base,
                subject_operation_outcome: subjectOutcome,
                contributing_operation_count: contributor.opIds.length,
                committed_operation_count: committed.length,
            },
        };
    }

    return {
        packageId: contributor.packageId,
        observationKind: "outcome",
        reason:
            subjectOutcome === "partially_committed"
                ? "Some operations derived from this governed judgment committed and some did not."
                : "No operation derived from this governed judgment committed.",
        detail: {
            ...base,
            result: "failed",
            failure_class: (subjectOutcome === "partially_committed"
                ? "partial_commit"
                : "subject_not_committed") satisfies ProcessingExecutionFailureClass,
            subject_operation_outcome: subjectOutcome,
            contributing_operation_count: contributor.opIds.length,
            committed_operation_count: committed.length,
        },
    };
}

/**
 * Whether one operation result counts as committed for this subject.
 *
 * `skipped` with `idempotentReplay` is a prior attempt's commit being carried
 * forward — the record exists, so it counts. `async_failed`, `failed` and
 * `compensated` do not: a compensated operation was REVERSED, and counting it
 * would report a rollback as a commit.
 */
function isCommittedResult(result: OperationResult): boolean {
    if (result.status === "committed") return true;
    return result.status === "skipped" && result.idempotentReplay;
}

function classifySubject(contributingCount: number, committedCount: number): SubjectOperationOutcome {
    if (contributingCount > 0 && committedCount === contributingCount) return "all_committed";
    if (committedCount === 0) return "none_committed";
    return "partially_committed";
}

/** Attempt outcomes that may ever yield an `executed` observation for some subject. */
export function attemptCanProduceExecution(outcome: AttemptOutcome): boolean {
    return outcome === "committed" || outcome === "partially_committed";
}
