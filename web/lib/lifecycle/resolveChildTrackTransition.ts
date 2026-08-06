/**
 * May this child's enrollment track move from where it is to where a decision wants it?
 *
 * Pure. Reads nothing, writes nothing — the caller supplies the current state, so this cannot
 * mutate a child and a test can prove that by construction.
 *
 * The classification vocabulary is NOT redefined here. `classifyChildTrackState` already owns the
 * four-way judgement (terminal / active_pre_enrollment / enrolled_blocking / unknown_blocking) and
 * is already the fail-closed authority the family-close guard trusts. A second table of "which
 * states are terminal" living beside it is how the two would eventually disagree, so this module
 * only decides DIRECTION and delegates every question about what a state MEANS.
 *
 * Four rules, in the order they are checked:
 *
 *  1. Unknown current state → refuse. A state the platform has not been taught is not a licence to
 *     write over it.
 *  2. Same destination as the current position → allow, and report it as a no-op. A double-submit
 *     must not be an error the operator has to interpret, and it must not write twice.
 *  3. Enrolled → anything else → refuse. Ending or redirecting an enrollment is an
 *     agreement-ending operation with its own governed process; a Decision-surface button is not it.
 *  4. Terminal → active → refuse. Reopening a closed track is a governed reopen, and no reopen path
 *     exists for a child track today. Silently resurrecting one here would invent the governance.
 */

import { classifyChildTrackState } from "@/lib/lifecycle/familyCloseGuard";

export type ChildTrackTransitionRefusalCode =
    /** Current state is not in the platform's vocabulary — fail closed. */
    | "current_state_unknown"
    /** Enrolled tracks are ended only by the governed enrollment-ending process. */
    | "enrolled_cannot_regress"
    /** Terminal tracks are reopened only by a governed reopen, which does not exist yet. */
    | "terminal_cannot_reopen";

export type ChildTrackTransitionDecision =
    /** Proceed, and this genuinely changes the track. */
    | { allowed: true; noop: false }
    /**
     * Proceed, but the track is already where the decision wants it. The caller must NOT write —
     * writing would produce a second audit record and a second `stage_entered_at` for a position
     * the child never left.
     */
    | { allowed: true; noop: true }
    | { allowed: false; code: ChildTrackTransitionRefusalCode; message: string };

/**
 * Decide whether one child's track may move to `targetState`.
 *
 * `currentState` is `process_instances.state`: `null` is a REAL value meaning "riding the family
 * track, no decision recorded yet", which `classifyChildTrackState` reads as live. `undefined`
 * means the field was not read, which is the case that must never be guessed.
 */
export function resolveChildTrackTransition(input: {
    currentState: string | null | undefined;
    targetState: string;
    /** Operator-facing name, so a refusal can say who it is about. Never an id. */
    participantLabel?: string | null;
}): ChildTrackTransitionDecision {
    const target = input.targetState.trim();
    const who = input.participantLabel?.trim() || "This child";

    const currentClassification = classifyChildTrackState(input.currentState);
    if (currentClassification === "unknown_blocking") {
        return {
            allowed: false,
            code: "current_state_unknown",
            message:
                `${who} is in an enrollment state this process does not recognize, so it cannot be `
                + `changed from here. Check the child's enrollment record.`,
        };
    }

    const current = typeof input.currentState === "string" ? input.currentState.trim() : null;

    // Idempotence is decided BEFORE the regression rules, so re-submitting the decision that put a
    // child where they are does not get refused as a regression against itself.
    if (current !== null && current === target) {
        return { allowed: true, noop: true };
    }

    if (currentClassification === "enrolled_blocking") {
        return {
            allowed: false,
            code: "enrolled_cannot_regress",
            message:
                `${who} is already enrolled. Ending or changing an enrollment is handled by the `
                + `enrollment process, not from here.`,
        };
    }

    if (currentClassification === "terminal") {
        // Terminal → terminal is a correction (e.g. not_enrolling → withdrawn), not a reopen, and
        // stays permitted. Only a return to a live state is refused.
        const targetClassification = classifyChildTrackState(target);
        if (targetClassification !== "terminal") {
            return {
                allowed: false,
                code: "terminal_cannot_reopen",
                message:
                    `${who}'s enrollment track is already closed. Reopening it is not something this `
                    + `step can do.`,
            };
        }
    }

    return { allowed: true, noop: false };
}
