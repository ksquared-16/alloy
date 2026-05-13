import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { createDisabledAiProvider } from "@/lib/ai/disabledStructuredProvider";
import { resolveStructuredAiProviderForPolicy } from "@/lib/ai/resolveStructuredAiProvider";
import type { AiStructuredProvider } from "@/lib/ai/providerTypes";

export { createDisabledAiProvider } from "@/lib/ai/disabledStructuredProvider";

export type { ResolveStructuredAiProviderOptions } from "@/lib/ai/resolveStructuredAiProvider";

/**
 * Resolves stub vs OpenAI-compatible vs disabled structured provider from org policy + env gates.
 */
export function createAiProviderForPolicy(
    policy: ResolvedAiOrgPolicyV1,
    options?: ResolveStructuredAiProviderOptions,
): AiStructuredProvider {
    return resolveStructuredAiProviderForPolicy(policy, options);
}
