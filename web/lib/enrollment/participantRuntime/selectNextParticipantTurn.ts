/**
 * THE one owner of "what should the participant resolve next?" (Phase 3).
 *
 * Pure. **Never calls a provider.** The same deterministic state always selects the same next
 * objective, which is what makes the conversation resumable, auditable and testable — and what makes
 * the provider optional rather than load-bearing.
 *
 * ## D-100 — known values are confirmed once
 *
 * A known participant fact contributing to the active objective requires ONE confirmation for this
 * Enrollment session, unless D-99 already records a confirmation of that exact value. So
 * `known_requires_confirmation` is a turn, `confirmed` is not, and a corrected value re-opens the
 * turn automatically because the D-99 fingerprint no longer matches.
 *
 * Signatures, consents, acknowledgments and every other recipient-scoped or artifact-specific
 * control are excluded from ordinary confirmation by construction: Slice 2.4 already gives them
 * `artifact_specific` state and a null shared key, so they can never reach a confirm turn. They are
 * handed to the Form that owns them via `complete_artifact`.
 */

import type {
    EnrollmentInformationNeed,
    EnrollmentInformationNeeds,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { EnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import type { ParticipantEvidenceObligation } from "@/lib/enrollment/participantRuntime/participantEvidenceObligations";

/**
 * Deterministic wording — the FALLBACK that always exists.
 *
 * Plain and functional on purpose. A provider may render something warmer for the same turn, but
 * this is what ships when the provider is disabled, unavailable, timing out or refused, and
 * Enrollment must never depend on model uptime.
 *
 * The label comes from the authored Form control, so it is the operator's own wording rather than
 * anything generated.
 */
export function deterministicPrompt(need: EnrollmentInformationNeed): string {
    const label = need.occurrences[0]?.label?.trim() || need.identity.canonical_key || "this detail";
    if (need.state === "known_requires_confirmation") {
        return `We have ${label} as ${formatValue(need.current_value)}. Is that correct?`;
    }
    /*
     * A label that is ALREADY a question is asked as written.
     *
     * Wrapping produced "What is How would you describe your child's gender??" — the school's own
     * sentence with a stem bolted onto the front and a second question mark on the end. The
     * participant surface re-composes this wording, so no parent has read it; a deterministic
     * fallback that is unusable when it is reached is not a fallback.
     */
    if (/\?\s*$/.test(label)) return label;
    return `What is ${label}?`;
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "(not set)";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

/**
 * Order needs are asked in.
 *
 * Confirmations first, then collections, each in the projection's own authored order. Confirming
 * what is already known is cheaper for the parent than typing something new, and clearing those
 * turns first makes the remaining list shorter and more honest. Within a group the order is the
 * projection's — never sorted by anything that changes as the participant progresses, or the queue
 * would reshuffle underneath them.
 */
const TURN_PRIORITY: Record<string, number> = {
    known_requires_confirmation: 0,
    missing: 1,
};

export type NextParticipantTurnInput = {
    readonly needs: EnrollmentInformationNeeds;
    readonly progress: EnrollmentParticipantProgress;
    /**
     * Required attachments still outstanding, in packet order.
     *
     * Absent means the caller resolved no evidence, which selects exactly as before — so every
     * existing caller and test is unchanged by the addition.
     */
    readonly outstandingEvidence?: readonly ParticipantEvidenceObligation[];
};

/**
 * Select the next turn.
 *
 * Precedence, and each step is a platform decision the model never participates in:
 *
 *  1. a shared semantic fact still needing confirmation or collection;
 *  2. otherwise, an outstanding Form requirement whose artifact-specific content remains —
 *     handed to the Form, because conversation handles SHARED information and exact Forms remain
 *     the authoritative artifacts;
 *  3. otherwise `complete`.
 *
 * Step 2 deliberately does not try to conversationally replace Form controls. That preserves the
 * long-term architecture: shared facts collected efficiently, artifacts still authoritative.
 */
export function selectNextParticipantTurn(input: NextParticipantTurnInput): ParticipantTurn {
    /**
     * Every UNRESOLVED shared need is offered, blocking or not.
     *
     * Filtering on `requires_participant_action` skipped optional needs entirely — so a journey
     * whose only outstanding fact was optional went straight to the paperwork and the parent was
     * never spoken to at all. That is exactly what a specialist would not do: allergies is optional
     * and it is still the question you ask.
     *
     * Optionality decides whether a need BLOCKS completion — it drives the progress count and the
     * skip affordance — not whether it is worth asking about.
     */
    const actionable = input.needs.needs
        .filter((need) => need.state === "known_requires_confirmation" || need.state === "missing")
        .sort((a, b) => (TURN_PRIORITY[a.state] ?? 9) - (TURN_PRIORITY[b.state] ?? 9));

    const next = actionable[0];
    if (next) {
        return {
            kind: next.state === "known_requires_confirmation" ? "confirm_known_value" : "collect_missing_value",
            need: next,
            prompt: deterministicPrompt(next),
            proposed_value: next.state === "known_requires_confirmation" ? next.current_value : null,
            resolves_occurrences: next.occurrence_count,
        };
    }

    /**
     * EVIDENCE BEFORE PREPARATION.
     *
     * Every shared fact is settled, so the next thing the parent owes is any REQUIRED document. It
     * comes before the handoff for two reasons, and the second is the one that matters long term:
     * the runtime must not say it has filled out paperwork that is waiting on an attachment, and a
     * document that arrives after generation cannot inform what was generated. Asking here is what
     * lets a future Health extraction populate structured dose truth and regenerate the CIS before
     * the parent ever reads it.
     */
    const evidence = input.outstandingEvidence ?? [];
    if (evidence.length > 0) {
        return {
            kind: "collect_evidence",
            need: null,
            prompt:
                evidence.length === 1
                    ? `Before I prepare the paperwork, please attach ${evidence[0]!.title}.`
                    : `Before I prepare the paperwork, please attach ${evidence.length} required documents.`,
            proposed_value: null,
            resolves_occurrences: 0,
            evidence,
        };
    }

    // Every shared fact is settled. What remains is artifact work the Form owns — signatures,
    // recipient-scoped content, anything a conversation must not answer on the parent's behalf.
    const outstandingForm = input.progress.requirements.find(
        (r) => r.kind === "form" && r.status === "outstanding",
    );
    if (outstandingForm) {
        return {
            kind: "complete_artifact",
            need: null,
            prompt: "Your details are saved. Please review and complete the remaining form.",
            proposed_value: null,
            resolves_occurrences: 0,
        };
    }

    return {
        kind: "complete",
        need: null,
        prompt: "Everything we need is complete.",
        proposed_value: null,
        resolves_occurrences: 0,
    };
}
