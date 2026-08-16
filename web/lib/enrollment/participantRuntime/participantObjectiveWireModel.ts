/**
 * What a PARTICIPANT is allowed to see of their own Enrollment objective (Phase 3).
 *
 * The internal projection carries org ids, revision ids, requirement ids, session item ids and
 * per-occurrence Form plumbing. A parent needs none of that, and a public surface that returns
 * internal identifiers because they were convenient is how identifiers become an API nobody meant
 * to publish.
 *
 * So the wire model is an explicit allow-list: progress counts, the current turn, and the remaining
 * work described in the participant's own terms. Adding a field here is a visible decision.
 *
 * Pure. No I/O.
 */

import type { ParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";

export type ParticipantObjectiveWire = {
    readonly stage_key: string | null;
    readonly progress: {
        readonly total: number;
        readonly satisfied: number;
        readonly remaining: number;
    };
    /** "3 things remaining", backed by deterministic need state. */
    readonly things_remaining: number;
    readonly next_turn: {
        readonly kind: string;
        readonly prompt: string;
        readonly proposed_value: unknown;
        /** How many Form fields this one answer resolves — the ask-once ratio, shown honestly. */
        readonly resolves_occurrences: number;
        /** The control type to render when a deterministic input is needed. */
        readonly input_type: string | null;
        readonly label: string | null;
    };
    /** Whether anything at all is left for the participant. */
    readonly complete: boolean;
};

export function participantObjectiveWireModel(
    objective: ParticipantEnrollmentObjective,
): ParticipantObjectiveWire {
    const turn = objective.next_turn;
    const firstOccurrence = turn.need?.occurrences[0] ?? null;

    return {
        stage_key: objective.stage_key,
        progress: {
            total: objective.progress.total_requirements,
            satisfied: objective.progress.satisfied_requirements,
            remaining: objective.progress.remaining_requirements,
        },
        things_remaining: objective.needs.needs_requiring_action,
        next_turn: {
            kind: turn.kind,
            prompt: turn.prompt,
            proposed_value: turn.proposed_value,
            resolves_occurrences: turn.resolves_occurrences,
            // Enough for the surface to render the deterministic control when the provider is
            // unavailable — the fallback has to be renderable from this payload alone.
            input_type: firstOccurrence ? inputTypeForNeed(objective, firstOccurrence.form_field_id) : null,
            label: firstOccurrence?.label ?? null,
        },
        complete: turn.kind === "complete",
    };
}

/**
 * The control type for the current need.
 *
 * Derived from the need's own first occurrence rather than guessed from the value: the authored Form
 * control is what the participant will ultimately fill, so the conversational input should match it.
 */
function inputTypeForNeed(
    objective: ParticipantEnrollmentObjective,
    formFieldId: string,
): string | null {
    const need = objective.next_turn.need;
    if (!need) return null;
    const occurrence = need.occurrences.find((o) => o.form_field_id === formFieldId);
    return occurrence ? "text" : null;
}
