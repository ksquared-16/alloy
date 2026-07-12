/**
 * Resolves structured AI provider from org policy + process env (stub / OpenAI-compatible / disabled).
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { hasOpenAiStructuredCredentials, isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { isAiEnrichmentUsePermissionRequired } from "@/lib/ai/aiEnrichmentPermissions";
import { createDisabledAiProvider } from "@/lib/ai/disabledStructuredProvider";
import { createOpenAiCompatibleStructuredProvider } from "@/lib/ai/openAiCompatibleStructuredProvider";
import { createStubAiProvider } from "@/lib/ai/stubProvider";
import type { AiStructuredProvider } from "@/lib/ai/providerTypes";

export type ResolveStructuredAiProviderOptions = {
    /** Set by HTTP routes only when strict permission mode + `ai.enrichment.use` grant applies. */
    openai_live_invocation_permitted?: boolean;
};

/**
 * Stub path: `AI_ENRICHMENT_STUB_ENABLED` + policy `provider: stub`.
 * Live OpenAI-compatible path: policy `provider: openai` + strict permission + credentials (see options).
 */
export function resolveStructuredAiProviderForPolicy(
    policy: ResolvedAiOrgPolicyV1,
    options?: ResolveStructuredAiProviderOptions,
): AiStructuredProvider {
    const openaiLive = options?.openai_live_invocation_permitted === true;

    if (!policy.enabled) {
        return createDisabledAiProvider();
    }

    if (policy.provider === "openai") {
        if (
            !openaiLive ||
            !isAiEnrichmentUsePermissionRequired() ||
            !hasOpenAiStructuredCredentials()
        ) {
            return createDisabledAiProvider();
        }
        return createOpenAiCompatibleStructuredProvider(policy);
    }

    if (policy.provider === "stub") {
        if (!isAiEnrichmentStubEnvEnabled()) {
            return createDisabledAiProvider();
        }
        return createStubAiProvider(policy);
    }

    return createDisabledAiProvider();
}
