/**
 * Resolves structured AI provider from org policy + process env (stub vs disabled).
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { createDisabledAiProvider } from "@/lib/ai/disabledProvider";
import { createStubAiProvider } from "@/lib/ai/stubProvider";
import type { AiStructuredProvider } from "@/lib/ai/providerTypes";

/**
 * Live providers (OpenAI, etc.) are not wired — return disabled unless stub path matches.
 */
export function resolveStructuredAiProviderForPolicy(policy: ResolvedAiOrgPolicyV1): AiStructuredProvider {
    if (!isAiEnrichmentStubEnvEnabled()) {
        return createDisabledAiProvider();
    }
    if (!policy.enabled || policy.provider !== "stub") {
        return createDisabledAiProvider();
    }
    return createStubAiProvider(policy);
}
