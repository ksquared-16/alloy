/**
 * Information Package spec for participant conversational interpretation (D-101).
 *
 * ## What the provider sees, exhaustively
 *
 * Eight elements. The turn's shape, the participant's own response, and the vocabulary it may answer
 * in. That is everything needed to answer the one question the model is asked:
 *
 *   > What did the participant appear to mean about the specific need Alloy already selected?
 *
 * `select()` is the entire ingress. The objective, the progress projection, the Form schema, the
 * other needs, the packet session, the CRM record and the process instance have no path in, because
 * nothing reads them. An adversarial extra property on the source cannot arrive by being present.
 *
 * ## Why the response text is admissible here and nowhere else
 *
 * `participant_response_text` is the platform's only free-text element. It carries the D-101 policy,
 * which minimizes `email` and `phone` (both genuinely detected) and DECLARES `person_name`,
 * `street_address` and `health_information` as admitted-unminimized rather than claiming a redaction
 * that never ran.
 *
 * The narrowness is enforced before this spec is reached — an ineligible turn never builds a package
 * — so this file describes the shape of an admitted turn, not the decision to admit one.
 *
 * ## What is deliberately NOT sent
 *
 * The need's canonical key IS sent (`need_field_key`), because the model must know what kind of
 * value it is interpreting. But no requirement id, no session id, no form id, no process instance,
 * no stage: the model has no use for them, and an identifier sent "for context" is an identifier
 * that can appear in an output someone later trusts.
 */

import { PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY } from "@/lib/trust/capabilities/participantConversationInterpretation/keys";
import type { InformationPackageSpecV1 } from "@/lib/trust/information/informationPackage";
import { STRUCTURED_CANDIDATE_KINDS } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

/** The bounded facts one interpretation turn needs. Assembled by the consumer, never a raw row. */
export type ParticipantInterpretationSource = {
    /** `confirm_known_value` | `collect_missing_value` — the deterministic turn kind. */
    readonly turn_kind: string;
    /** The need's canonical key, e.g. `customer_member:dob`. Chosen by the platform. */
    readonly need_field_key: string;
    /** The authored control type: date, text, number, select, boolean. */
    readonly value_type: string;
    /** Closed option values when the control has them, else null. */
    readonly allowed_values: readonly (string | null)[] | null;
    /** The value being confirmed. Null on a collect turn. */
    readonly proposed_value: string | null;
    /** The participant's own words. The one free-text element in the platform. */
    readonly participant_response_text: string;
    /** The vocabulary the answer must come back in. */
    readonly allowed_candidate_kinds: readonly (string | null)[];
    /** A human-readable statement of the value's shape, e.g. "ISO calendar date (YYYY-MM-DD)". */
    readonly value_constraint: string | null;
};

export const PARTICIPANT_INTERPRETATION_SPEC_KEY = "participant_conversation_interpretation_input" as const;
export const PARTICIPANT_INTERPRETATION_SPEC_VERSION = "1.0.0" as const;

export const participantInterpretationInformationSpec: InformationPackageSpecV1<ParticipantInterpretationSource> =
    {
        key: PARTICIPANT_INTERPRETATION_SPEC_KEY,
        version: PARTICIPANT_INTERPRETATION_SPEC_VERSION,
        decision_class_key: PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,
        source_kind: "participant_conversation_turn",
        elements: [
            {
                key: "turn_kind",
                information_class: "operational",
                source_field: "turn_kind",
                select: (s) => s.turn_kind,
            },
            {
                key: "need_field_key",
                information_class: "operational",
                source_field: "need_field_key",
                select: (s) => s.need_field_key,
            },
            {
                key: "value_type",
                information_class: "operational",
                source_field: "value_type",
                select: (s) => s.value_type,
            },
            {
                key: "allowed_values",
                information_class: "operational",
                source_field: "allowed_values",
                select: (s) => s.allowed_values ?? null,
            },
            {
                // The value the participant is being asked about. Identity-class: it is a fact about
                // a real child, so it is classified as what it is rather than as configuration.
                key: "proposed_value",
                information_class: "identity",
                source_field: "proposed_value",
                select: (s) => s.proposed_value,
                required_text_minimizers: ["email", "phone"],
            },
            {
                // THE free-text element. D-101 is the only reason it can exist.
                key: "participant_response_text",
                information_class: "identity",
                source_field: "participant_response_text",
                select: (s) => s.participant_response_text,
                required_text_minimizers: ["email", "phone"],
            },
            {
                key: "allowed_candidate_kinds",
                information_class: "operational",
                source_field: "allowed_candidate_kinds",
                select: () => [...STRUCTURED_CANDIDATE_KINDS],
            },
            {
                key: "value_constraint",
                information_class: "operational",
                source_field: "value_constraint",
                select: (s) => s.value_constraint,
            },
        ],
    };

export const PARTICIPANT_INTERPRETATION_DECLARED_ELEMENT_KEYS: readonly string[] = Object.freeze(
    participantInterpretationInformationSpec.elements.map((e) => e.key),
);

/**
 * What this spec deliberately does NOT read, and why.
 *
 * Kept as a declaration so a future edit that adds one has to delete a line saying not to, rather
 * than silently widening what reaches a provider.
 */
export const PARTICIPANT_INTERPRETATION_EXCLUDED_SOURCE_FIELDS: Readonly<Record<string, string>> =
    Object.freeze({
        requirement_id:
            "The model may not name a requirement, so it has no use for one. Sending it would put a value it could echo into its context.",
        session_id: "Session identity is platform plumbing; interpretation does not need it.",
        process_instance_id: "Lifecycle identity. The model has no lifecycle authority by design.",
        form_definition_version_id:
            "Which artifact renders the need is irrelevant to what the participant meant.",
        stage_key: "Process stage is a lifecycle fact the model must never influence.",
        occurrences: "The fifteen targets a need resolves are a platform concern, not an interpretive one.",
        other_needs: "Only the CURRENT turn is interpretable. The rest of the objective never leaves.",
        crm_snapshot: "Unrelated family data. There is no interpretation question it answers.",
        form_schema: "The whole schema. Only the current control's type and options are needed.",
    });
