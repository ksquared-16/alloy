/**
 * Keys owned by the participant-conversation-interpretation capability (D-101).
 *
 * A leaf module with no imports, matching the proven capability shape: the spec, the contribution
 * and the consumer each name a key without importing one another, which keeps the composition graph
 * acyclic.
 */

export const PARTICIPANT_CONVERSATION_INTERPRETATION_CLASS_KEY =
    "participant_conversation_interpretation" as const;

/**
 * The PROVIDER-BACKED class. Separate from the deterministic one for the same reason
 * `attention_suggestion_enrichment_provider_backed` is: only this class can send anything anywhere,
 * and naming it is the affirmative provider choice (D-42). The deterministic interpreter needs no
 * class at all — it never leaves the process.
 */
export const PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY =
    "participant_conversation_interpretation_provider_backed" as const;

export const PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION_POLICY_KEY =
    "participant_conversation_interpretation_v1" as const;

/**
 * The platform privacy policy this capability REFERENCES. It does not own it — privacy policies are
 * platform-owned (`privacy-runtime.md` §Privacy Policies). This is the D-101 policy: the ONLY policy
 * in the platform that admits participant-authored free text.
 */
export const PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY =
    "participant_conversation_admission_v1" as const;

export const PARTICIPANT_CONVERSATION_INTERPRETATION_INFORMATION_KEY =
    "participant_conversation_interpretation_input" as const;
