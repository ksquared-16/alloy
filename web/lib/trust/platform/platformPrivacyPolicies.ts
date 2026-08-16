/**
 * Platform-owned privacy policies.
 *
 * `privacy-runtime.md` §Privacy Policies is explicit: *"Policies are
 * platform-owned. Decision Contracts reference policies rather than
 * implementation."* Privacy policies are also deliberately absent from
 * `trust-runtime.md` §Extension Points, which lists what a **capability** may
 * register — Decision Classes, Knowledge Providers, Reasoning Strategies,
 * Validation Policies and Learning Policies.
 *
 * So a policy is registered once, here, and every capability that needs it
 * references it by key. Sharing is by reference; a second registration of the
 * same key fails composition.
 *
 * @see docs/platform/trust/privacy-runtime.md — Privacy Policies
 */

import { ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import { PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import { PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY } from "@/lib/trust/capabilities/participantConversationInterpretation/keys";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";

/**
 * Strict minimization with financial information refused outright.
 *
 * Named for the surface that first required it, and unchanged from Trust
 * Runtime V1 — the key is pinned into persisted contracts, so renaming it would
 * break replay of every existing package.
 */
export const ATTENTION_SUGGESTION_MINIMIZATION_V1: PrivacyPolicyV1 = {
    key: ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
    pii_mode: "strict",
    prohibited_classes: ["financial"],
};

/**
 * Strict minimization for Processing source classification, financial refused.
 *
 * The governed classification carries only a category, a bounded confidence and
 * fixed rule tokens — no filename, no title, no document content. `strict` is
 * nonetheless the correct mode: it costs nothing when there is nothing to
 * minimize, and it means a future element that DOES carry source text is
 * minimized by default rather than by remembering to ask.
 */
/**
 * D-101 — participant-authored conversational text, narrowly admitted.
 *
 * ## The ONLY policy in this platform that admits free text
 *
 * Every other policy governs closed-vocabulary facts, and the generic contract is unchanged: text
 * carrying a class this platform cannot detect still refuses everywhere else. This policy does not
 * relax that rule — it states a bounded exception for one input, under conditions the capability
 * enforces before the policy is ever reached.
 *
 * What makes it narrow is not this object. It is that reaching it requires ALL of: the text came
 * from the participant's own explicit response; a deterministic current turn exists; that turn's
 * semantic domain is on the D-101 allow-list; org/provider authorization permits governed reasoning.
 * A failure of any one of them never gets here.
 *
 * ## Honesty about what is not minimized
 *
 * `email` and `phone` are genuinely detected and removed — those detectors exist. `person_name`,
 * `street_address` and `health_information` are declared as ACKNOWLEDGED-UNMINIMIZED, which is the
 * whole point of D-101: the evidence says plainly that the platform cannot remove them and did not
 * pretend to. Declaring them in `required_text_minimizers` would refuse the transform (correctly,
 * for a general policy); omitting them entirely would admit the same text while recording NOTHING,
 * which is the outcome this field exists to prevent.
 *
 * `government_id` is deliberately absent from both lists. It is not admitted at all — the capability
 * refuses those turns before a package is built, so there is nothing to acknowledge.
 */
export const PARTICIPANT_CONVERSATION_ADMISSION_V1: PrivacyPolicyV1 = {
    key: PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY,
    pii_mode: "strict",
    // Financial is refused outright, as everywhere else. Nothing in an Enrollment conversation turn
    // is financial, so its presence would mean the adapter contract was bypassed.
    prohibited_classes: ["financial"],
    // Actually performed: both detectors exist and run over the admitted response.
    required_text_minimizers: ["email", "phone"],
    // Admitted without transformation, and SAID so.
    acknowledged_unminimized_classes: ["person_name", "street_address", "health_information"],
};

export const PROCESSING_SOURCE_MINIMIZATION_V1: PrivacyPolicyV1 = {
    key: PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY,
    pii_mode: "strict",
    prohibited_classes: ["financial"],
};

/**
 * Strict minimization for Processing identity subject resolution, with identity
 * AND financial information refused outright.
 *
 * `identity` is prohibited here — unlike the other two policies — because the
 * governed material is deliberately identity-FREE: categories, counts, bands and
 * Processing-authored sentences. If an identity-class element ever reached this
 * class, the correct response is to refuse the whole transform rather than
 * minimize it, because its presence means the adapter contract was bypassed.
 */
export const PROCESSING_IDENTITY_MINIMIZATION_V1: PrivacyPolicyV1 = {
    key: PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY,
    pii_mode: "strict",
    prohibited_classes: ["identity", "financial"],
};

export const PLATFORM_PRIVACY_POLICY_CONTRIBUTION: TrustContribution = {
    id: "platform.privacy_policies",
    owner: "platform",
    privacyPolicies: [
        ATTENTION_SUGGESTION_MINIMIZATION_V1,
        PROCESSING_SOURCE_MINIMIZATION_V1,
        PARTICIPANT_CONVERSATION_ADMISSION_V1,
        PROCESSING_IDENTITY_MINIMIZATION_V1,
    ],
};
