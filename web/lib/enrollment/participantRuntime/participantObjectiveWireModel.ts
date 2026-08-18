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

/**
 * Which part of the experience the participant is in.
 *
 * `shared_collection` — confirming and supplying facts that populate every artifact at once. The raw
 * Form must NOT be presented underneath: a parent who has just answered a question should not then
 * find the same box below it.
 * `artifact_review` — shared facts are settled; what remains belongs to a specific document
 * (acknowledgment, signature, an artifact-only field). This is where the populated artifact is shown.
 * `complete` — nothing remains.
 */
export type ParticipantPhase = "shared_collection" | "artifact_review" | "complete";

export type ParticipantObjectiveWire = {
    readonly stage_key: string | null;
    /** The child this Enrollment is about, for participant copy. Never an internal identifier. */
    readonly subject_display_name: string | null;
    readonly phase: ParticipantPhase;
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
        /** Closed option set, when the authored control has one. Empty otherwise. */
        readonly options: readonly string[];
        /** The authored Form permits leaving this unanswered — offer a real way past it. */
        readonly optional: boolean;
        /**
         * The artifact fields this single answer fills.
         *
         * Already visible to the participant — they are the ids of controls on their own form — and
         * they are what lets the surface show the answer in the paperwork the instant it is given,
         * rather than leaving a field the parent just answered looking empty until a reload.
         */
        readonly field_ids: readonly string[];
    };
    /** Whether anything at all is left for the participant. */
    readonly complete: boolean;
};

export function participantObjectiveWireModel(
    objective: ParticipantEnrollmentObjective,
    context?: { readonly subjectDisplayName?: string | null },
): ParticipantObjectiveWire {
    const turn = objective.next_turn;
    const firstOccurrence = turn.need?.occurrences[0] ?? null;

    /**
     * PHASE IS DERIVED FROM THE TURN — one authority, not two.
     *
     * It used to be derived independently, from `known_requiring_confirmation.length + missing.length`.
     * That produced a state the product must never reach: the turn selector skips a need that does
     * not require participant action, so an OPTIONAL missing fact left the turn at
     * `complete_artifact` while the phase still said `shared_collection`. The card rendered
     * "review and finish it below" because it reads the turn; the host suppressed the artifact
     * because it reads the phase. The parent got a handoff with nothing beneath it.
     *
     * Two readers of the same situation disagreed because they asked different questions. Now the
     * turn — which is the deterministic runtime's own answer to "what next" — decides both.
     */
    const phase: ParticipantPhase =
        turn.kind === "complete"
            ? "complete"
            : turn.kind === "complete_artifact"
              ? "artifact_review"
              : "shared_collection";

    return {
        stage_key: objective.stage_key,
        subject_display_name: (context?.subjectDisplayName ?? "").trim() || null,
        phase,
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
            options: firstOccurrence ? optionsForNeed(objective, firstOccurrence.form_field_id) : [],
            optional: turn.need?.optional === true,
            field_ids: (turn.need?.occurrences ?? []).map((o) => o.form_field_id),
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
    // The authored type, not "text". This returned a constant, which is why a date of birth and a
    // free-text note reached the participant as the same undifferentiated box.
    return occurrence ? occurrence.field_type : null;
}

/** The authored option set for the current need, when the control is a closed one. */
function optionsForNeed(
    objective: ParticipantEnrollmentObjective,
    formFieldId: string,
): readonly string[] {
    const need = objective.next_turn.need;
    if (!need) return [];
    return need.occurrences.find((o) => o.form_field_id === formFieldId)?.options ?? [];
}
