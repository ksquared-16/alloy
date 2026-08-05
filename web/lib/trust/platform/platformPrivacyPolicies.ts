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
        PROCESSING_IDENTITY_MINIMIZATION_V1,
    ],
};
