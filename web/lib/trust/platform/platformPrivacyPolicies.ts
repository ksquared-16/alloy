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

export const PLATFORM_PRIVACY_POLICY_CONTRIBUTION: TrustContribution = {
    id: "platform.privacy_policies",
    owner: "platform",
    privacyPolicies: [ATTENTION_SUGGESTION_MINIMIZATION_V1],
};
