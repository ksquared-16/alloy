/**
 * What an operator decision DID to the engine's governed judgment.
 *
 * ## The defect this corrects
 *
 * Phase 1.6 classified from `decided_by === "operator"` alone, so *every*
 * operator action superseded the prior Decision Package — including a plain
 * confirmation of the engine's own recommendation. That is wrong twice over: it
 * records that a judgment stopped being current when the operator in fact
 * agreed with it, and — because Phase 1.7 excludes superseded packages from
 * execution binding — it made the normal reviewed path unable to record its
 * real-world outcome at all.
 *
 * Agreement is not supersession.
 *
 * ```text
 * operator agrees with the engine    → package remains current  → accepted
 * engine declined to decide          → package remains current  → accepted
 * operator defers                    → package remains current  → deferred
 * operator replaces the judgment     → package is superseded
 * ```
 *
 * ## What is compared
 *
 * The durable ENGINE judgment against the durable OPERATOR result. The engine's
 * answer is not stored — an operator decision overwrites `decision_action` and
 * `selected_candidate_id` in place — but it is exactly reconstructable from
 * `candidates`, which no operator path writes. See `engineJudgment`.
 *
 * Never from `decided_by`, which says only that *someone* acted. Never from
 * `provisional.create_new_override.reason`, which is free text an operator
 * typed and may name a family: the effect is derived from structure, so unsafe
 * prose has no route into the decision at all.
 *
 * ## Failing closed
 *
 * An unrecognised shape yields `unsupported_or_ambiguous`, which records
 * NOTHING. Guessing would either invent a supersession that did not happen or
 * suppress one that did, and of the two available errors, saying nothing is the
 * one that cannot corrupt a lifecycle.
 *
 * Pure. No I/O, no clock, no Trust import.
 */

import type { ProcessingResolutionRow } from "../processingResolutionsDb";
import { engineJudgmentFromCandidates, type EngineSubjectJudgment } from "../engineJudgment";

/**
 * The closed vocabulary of what can happen to a governed identity judgment.
 *
 * Two members are produced by seams other than this classifier and are named
 * here so the vocabulary is one list rather than three:
 *  - `replacement_generation` — a new deterministic generation captured a
 *    replacement package (`supersedeForReplacementPackage`);
 *  - `fact_correction` — an operator corrected a FACT. It is never emitted,
 *    deliberately: `recordCorrection` appends a fact version and does not re-run
 *    resolution, so no resolution row changes and the prior judgment still
 *    stands. Naming it makes that a stated decision rather than an omission.
 */
export const OPERATOR_DECISION_EFFECTS = [
    /** The operator chose exactly what the engine asserted. */
    "confirmation",
    /** The engine declined to decide (`review_required`); the operator supplied the answer. */
    "engine_deferred_review",
    /** The operator chose a different existing record than the engine asserted. */
    "override_existing_candidate",
    /** The operator created new against an engine assertion to link. */
    "override_create_new",
    /** The operator rejected a candidate set the engine had asserted a result for. */
    "rejection",
    /** The operator postponed: request information, escalate, propose merge. */
    "operator_deferred",
    /** A replacement deterministic generation produced a newer governed judgment. */
    "replacement_generation",
    /** An operator corrected a fact. Never emitted — see above. */
    "fact_correction",
    /** Unrecognised shape. Records nothing. */
    "unsupported_or_ambiguous",
] as const;

export type OperatorDecisionEffect = (typeof OPERATOR_DECISION_EFFECTS)[number];

/** What the effect means for the prior package's lifecycle. */
export const LIFECYCLE_CONSEQUENCES = ["remains_current", "superseded", "none"] as const;
export type LifecycleConsequence = (typeof LIFECYCLE_CONSEQUENCES)[number];

export type OperatorDecisionClassification = {
    readonly effect: OperatorDecisionEffect;
    readonly consequence: LifecycleConsequence;
    /**
     * The observation to append, or `null` when nothing honest can be said.
     *
     * Only kinds already in the Phase 0 vocabulary. No new kind is introduced,
     * and none is needed.
     */
    readonly observationKind: "accepted" | "deferred" | "superseded" | null;
    /** The engine judgment this was compared against, for evidence. */
    readonly engine: EngineSubjectJudgment;
    /** The operator's durable result. */
    readonly operatorAction: string | null;
    readonly operatorSelectedCandidateId: string | null;
};

/** Operator actions that postpone rather than decide. */
const DEFERRING_ACTIONS: ReadonlySet<string> = new Set([
    "request_information",
    "review_required",
    "escalate_duplicate",
    "propose_merge",
]);

/** Operator actions that name an existing record. */
const LINKING_ACTIONS: ReadonlySet<string> = new Set(["link_existing", "update_existing"]);

/**
 * Classify one durable operator decision against the engine's judgment.
 *
 * The row must already carry the operator's decision — this reads what
 * happened, not what was requested.
 */
export function classifyOperatorIdentityDecisionEffect(
    row: Pick<ProcessingResolutionRow, "candidates" | "decision_action" | "selected_candidate_id">,
): OperatorDecisionClassification {
    const engine = engineJudgmentFromCandidates(row.candidates);
    const operatorAction = row.decision_action ?? null;
    const operatorSelectedCandidateId = row.selected_candidate_id ?? null;

    const base = { engine, operatorAction, operatorSelectedCandidateId } as const;

    if (!operatorAction) {
        return { ...base, effect: "unsupported_or_ambiguous", consequence: "none", observationKind: null };
    }

    // ---- 1. agreement -------------------------------------------------------
    // Same action AND same selected record. Both matter: linking to a different
    // person is not agreement, however identical the verb.
    if (operatorAction === engine.action && operatorSelectedCandidateId === engine.selectedCandidateId) {
        return { ...base, effect: "confirmation", consequence: "remains_current", observationKind: "accepted" };
    }

    // ---- 2. the engine asserted nothing to contradict ------------------------
    // `review_required` is the engine declining to decide. Its package carries
    // `disposition: needs_review` and asks for an operator; an operator then
    // decided. Nothing it claimed became untrue, so it is not superseded — and
    // this is the branch that keeps the NORMAL reviewed path bindable.
    //
    // Checked before rejection and override on purpose: those describe
    // contradicting an assertion, and there is no assertion here.
    if (!engine.assertedResult) {
        return {
            ...base,
            effect: "engine_deferred_review",
            consequence: "remains_current",
            observationKind: "accepted",
        };
    }

    // ---- 3. the operator postponed ------------------------------------------
    // No result yet, so nothing replaced the engine's. The package stays current
    // and the review stays open.
    if (DEFERRING_ACTIONS.has(operatorAction)) {
        return { ...base, effect: "operator_deferred", consequence: "remains_current", observationKind: "deferred" };
    }

    // ---- 4. genuine disagreement --------------------------------------------
    if (operatorAction === "reject") {
        return { ...base, effect: "rejection", consequence: "superseded", observationKind: "superseded" };
    }
    if (operatorAction === "create_new") {
        return { ...base, effect: "override_create_new", consequence: "superseded", observationKind: "superseded" };
    }
    if (LINKING_ACTIONS.has(operatorAction)) {
        return {
            ...base,
            effect: "override_existing_candidate",
            consequence: "superseded",
            observationKind: "superseded",
        };
    }

    // ---- 5. fail closed ------------------------------------------------------
    return { ...base, effect: "unsupported_or_ambiguous", consequence: "none", observationKind: null };
}

export function isOperatorDecisionEffect(value: string): value is OperatorDecisionEffect {
    return (OPERATOR_DECISION_EFFECTS as readonly string[]).includes(value);
}
