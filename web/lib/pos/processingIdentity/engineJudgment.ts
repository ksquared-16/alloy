/**
 * The deterministic ENGINE judgment for one identity subject.
 *
 * ## Why this exists as a leaf module
 *
 * An operator decision UPDATES `decision_action`, `selected_candidate_id`,
 * `decided_by`, `operator_id` and `provisional` in place. The engine's original
 * answer is overwritten — so asking "did the operator agree with the engine?"
 * has no stored field to read.
 *
 * It is still answerable, exactly, because the engine's answer is a PURE
 * FUNCTION of `candidates`, and no operator path writes that column:
 *
 * ```text
 * candidates[0].confidenceBand → legacy confidence → default action
 * candidates[0].recordId       → selected candidate (unless "none")
 * ```
 *
 * That derivation used to live privately inside `canonicalResolutionEngine`.
 * Copying it into a classifier would create two definitions of "what the engine
 * decided" that drift the moment either is touched, and the drift would be
 * silent: the classifier would start calling overrides confirmations. So the
 * engine and the classifier now import ONE definition, and the engine's
 * behaviour is unchanged because it calls the same code it always did.
 *
 * A leaf: types only, no I/O, no clock.
 */

import { defaultActionForConfidence } from "@/lib/intake/resolve/buildProposals";
import type { IntakeRecordMatchConfidence } from "@/lib/intake/resolve/types";
import type { IdentityCandidate } from "@/lib/identity";

/** Confidence band → the legacy confidence vocabulary the action table keys on. */
export function bandToLegacyConfidence(band: string): IntakeRecordMatchConfidence {
    switch (band) {
        case "confirmed":
            return "exact_match";
        case "strong":
            return "probable_match";
        case "possible":
        case "weak":
            return "possible_match";
        case "conflicted":
            return "conflict";
        default:
            return "no_match";
    }
}

/** What the deterministic engine decided, before any operator acted. */
export type EngineSubjectJudgment = {
    /** `link_existing` | `review_required` | `reject` | `create_new`. */
    readonly action: string;
    /** The engine's own selected record, or `null` when it proposed none. */
    readonly selectedCandidateId: string | null;
    /** The top candidate's band, or `null` when there were no candidates. */
    readonly topConfidenceBand: string | null;
    /**
     * Whether the engine asserted an actionable RESULT.
     *
     * `review_required` is not a result — it is the engine declining to decide.
     * Nothing it says can be contradicted by the operator's answer, which is why
     * this flag exists rather than being re-derived at each call site.
     */
    readonly assertedResult: boolean;
};

/**
 * Reconstruct the engine's judgment from the candidates it persisted.
 *
 * Byte-identical to what `runCanonicalIdentityResolution` wrote at generation
 * time, because it is the same code.
 */
export function engineJudgmentFromCandidates(
    candidates: readonly IdentityCandidate[] | null | undefined,
): EngineSubjectJudgment {
    const top = candidates?.[0];
    const legacyConfidence: IntakeRecordMatchConfidence = top
        ? bandToLegacyConfidence(top.confidenceBand)
        : "no_match";
    const action = defaultActionForConfidence(legacyConfidence);
    return {
        action,
        selectedCandidateId: top?.recordId && top.recordId !== "none" ? top.recordId : null,
        topConfidenceBand: top?.confidenceBand ?? null,
        assertedResult: action !== "review_required",
    };
}
