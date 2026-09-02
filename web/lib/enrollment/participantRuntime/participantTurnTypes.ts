/**
 * Participant Runtime V1 — the deterministic turn contract (Phase 3).
 *
 * ## The invariant this file encodes
 *
 * **The deterministic runtime decides WHAT is needed. A provider may only help with HOW the
 * interaction happens.** A model never decides which requirements exist, which Forms are required,
 * whether a requirement is satisfied, whether Enrollment is complete, which semantic facts are
 * equivalent, or whether a value may be persisted. Those are platform decisions, and every one of
 * them was settled deterministically in Slices 2.1-2.4.
 *
 * The type system carries that split rather than relying on discipline:
 *
 *  - {@link ParticipantTurn} is produced ONLY by the deterministic selector. It names the need, its
 *    semantic identity and its proposed value.
 *  - {@link StructuredCandidate} is the ONLY shape a provider may return. It cannot name a field, a
 *    command, a requirement or a semantic key — the identity always comes from the turn the platform
 *    chose, never from the model's output.
 *
 * A model that returns `{ corrected_value: "May 6 2021" }` has proposed a STRING for a need the
 * platform already identified. It has not decided what is being asked, and it cannot.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantEvidenceObligation } from "@/lib/enrollment/participantRuntime/participantEvidenceObligations";
import type { PartyOffer } from "@/lib/enrollment/participantRuntime/partyOfferPlan";

/**
 * The turn kinds V1 supports.
 *
 * Small and explicit, and every one is backed by repository semantics rather than aspiration:
 *
 *  - `confirm_known_value`  — D-99/D-100: a known fact awaiting one confirmation.
 *  - `collect_missing_value`— a shared semantic fact with no usable value.
 *  - `complete_artifact`    — artifact-specific content remains; hand off to the Form.
 *  - `complete`             — nothing remains for the participant.
 *
 * `review_artifact` and `sign_artifact` are deliberately ABSENT. Signature is recipient-scoped and
 * artifact-specific, and the operator review gate is an existing packet concern — folding either
 * into this vocabulary would claim a runtime that does not exist yet. `complete_artifact` hands the
 * participant to the Form that already owns both.
 */
export const PARTICIPANT_TURN_KINDS = [
    "confirm_known_value",
    "collect_missing_value",
    /**
     * A required document the parent must attach — BEFORE the paperwork is prepared.
     *
     * Evidence is participant work like any other, and it used to be discovered inside the artifact
     * review, after the runtime had already claimed to have filled the paperwork out. Its own turn
     * kind is what lets the deterministic selector order it correctly, and what lets a future
     * extraction step run while there is still an artifact to inform.
     */
    "collect_evidence",
    /**
     * A person to add, by ROLE — never by numbered slot.
     *
     * "Would you like to add another parent or guardian?" is a question about people. Which box
     * they land in is projection's business, decided after the conversation, from canonical
     * relationship priority.
     */
    "collect_party",
    "complete_artifact",
    "complete",
] as const;

export type ParticipantTurnKind = (typeof PARTICIPANT_TURN_KINDS)[number];

export type ParticipantTurn = {
    readonly kind: ParticipantTurnKind;
    /** The need this turn resolves. Null only for `complete`. */
    readonly need: EnrollmentInformationNeed | null;
    /**
     * Deterministic wording, always present.
     *
     * A provider may render something warmer, but nothing may DEPEND on it doing so — Enrollment
     * must not become unavailable because a model is down.
     */
    readonly prompt: string;
    /** The value the participant is being asked to confirm. Null for a collect turn. */
    readonly proposed_value: unknown;
    /** How many Form targets this one turn resolves. The ask-once ratio, made visible. */
    readonly resolves_occurrences: number;
    /**
     * The attachments this turn is asking for. Present only on `collect_evidence`.
     *
     * Carried on the turn rather than fetched by the surface so one authority decides what is owed —
     * the same rule that keeps a model from choosing its own subject.
     */
    readonly evidence?: readonly ParticipantEvidenceObligation[];
    /** The role being offered, and who already holds it. Present only on `collect_party`. */
    readonly party?: PartyOffer;
};

/**
 * The ONLY shape a provider may return.
 *
 * Note what is absent: no field key, no semantic key, no command name, no requirement id, no target.
 * A provider cannot address anything — it can only respond about the turn the platform selected.
 *
 *  - `confirmed`           — the participant affirmed the proposed value as-is.
 *  - `corrected_value`     — they supplied a different value. STILL a candidate: it is validated
 *                            deterministically before it can become session state.
 *  - `unresolved`          — they did not answer, or said they do not know.
 *  - `clarification_needed`— the response was ambiguous.
 */
export const STRUCTURED_CANDIDATE_KINDS = [
    "confirmed",
    "corrected_value",
    "unresolved",
    "clarification_needed",
    /** The participant used the optional way out. There is no value, and that is the answer. */
    "declined",
] as const;

export type StructuredCandidateKind = (typeof STRUCTURED_CANDIDATE_KINDS)[number];

export type StructuredCandidate = {
    readonly kind: StructuredCandidateKind;
    /** Present only for `corrected_value`. Raw and untrusted until validation passes. */
    readonly value?: unknown;
};

/**
 * What the platform decided to DO about a candidate — never what the model asked for.
 *
 * `refused` is a first-class outcome, not an error path: a candidate that fails validation produces
 * no mutation and returns the participant to the same turn. The model's output is not truth merely
 * because the model emitted it.
 */
export type CandidateDisposition =
    | { readonly action: "confirm_value"; readonly value: unknown }
    | { readonly action: "write_shared_value"; readonly value: unknown }
    /**
     * ASKED, AND LEFT BLANK ON PURPOSE — settlement without a value.
     *
     * The need stops being asked and counts as settled, and NOTHING is written to `shared_values`.
     * Recording the shortcut's own label as the answer is what put "Nothing to add" in the middle-
     * name box of a signed Oregon health form.
     */
    | { readonly action: "decline_value" }
    | { readonly action: "no_change"; readonly reason: "unresolved" | "clarification_needed" }
    /**
     * READ, BUT NOT TRUSTED — the participant is asked, and NOTHING is persisted.
     *
     * Distinct from `refused`, which ends the attempt, and from `no_change`, which means the runtime
     * could not read the answer at all. Here the runtime read it and doubts it: a five-digit year, a
     * date of birth that would make the child a different age than the record says. The suspicious
     * value never reaches `shared_values`; it lives only in this response, as a question.
     *
     * `pending` is what would be written IF the parent says yes, so the next turn can accept a bare
     * confirmation without the browser ever naming a value.
     */
    | {
          readonly action: "clarify";
          readonly question: string;
          readonly pending: unknown;
          /** The value already on file, when this is a disagreement rather than a typo. */
          readonly existing?: unknown;
      }
    | { readonly action: "refused"; readonly reason: string };

/** Parse anything claiming to be a provider candidate. Unrecognized shapes become `unresolved`. */
export function parseStructuredCandidate(raw: unknown): StructuredCandidate {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { kind: "unresolved" };
    }
    const row = raw as Record<string, unknown>;
    const kind = typeof row.kind === "string" ? row.kind.trim() : "";
    if (!(STRUCTURED_CANDIDATE_KINDS as readonly string[]).includes(kind)) {
        // Fails CLOSED. An unreadable candidate must never be mistaken for a confirmation — that
        // would let a malformed provider response silently confirm a value nobody reviewed.
        return { kind: "unresolved" };
    }
    if (kind === "corrected_value") {
        return { kind: "corrected_value", value: row.value };
    }
    return { kind: kind as StructuredCandidateKind };
}
