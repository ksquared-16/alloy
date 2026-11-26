/**
 * Stub structured provider — synthetic overlays only; no network I/O.
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type { AiStructuredProvider, AiStructuredRequestV1, AiStructuredResponseV1 } from "@/lib/ai/providerTypes";
import { buildAttentionEnrichmentFromRedactedPayload } from "@/lib/trust/reasoning/strategies/attentionEnrichmentProposal";

const FEATURE_NEEDS_ATTENTION_DRAFT = "needs_attention_draft_enrichment";

function hasDraftFeature(policy: ResolvedAiOrgPolicyV1): boolean {
    return policy.allowed_features.includes("draft_enrichment");
}

/**
 * Returns a provider that honors org `allowed_features` for `needs_attention_draft_enrichment`.
 * Caller must pass **already redacted** `request.payload` (see enrich helper).
 */
export function createStubAiProvider(policy: ResolvedAiOrgPolicyV1): AiStructuredProvider {
    return {
        key: "stub",
        executionMode: "stub",
        async completeStructured<T = unknown>(
            request: AiStructuredRequestV1,
            options?: { timeout_ms?: number },
        ): Promise<AiStructuredResponseV1<T>> {
            void options;
            const completedAt = new Date().toISOString();
            if (request.feature !== FEATURE_NEEDS_ATTENTION_DRAFT) {
                return {
                    outcome: "policy_denied",
                    provider_key: "stub",
                    execution_mode: "stub",
                    completed_at_iso: completedAt,
                    error: {
                        code: "FEATURE_NOT_ALLOWED",
                        message: `Stub provider only supports feature "${FEATURE_NEEDS_ATTENTION_DRAFT}".`,
                        retryable: false,
                    },
                };
            }
            if (!hasDraftFeature(policy)) {
                return {
                    outcome: "policy_denied",
                    provider_key: "stub",
                    execution_mode: "stub",
                    completed_at_iso: completedAt,
                    error: {
                        code: "POLICY_DENIED",
                        message: "draft_enrichment is not in org ai_policy.allowed_features.",
                        retryable: false,
                    },
                };
            }
            const data = buildAttentionEnrichmentFromRedactedPayload(request.payload, completedAt);
            return {
                outcome: "ok",
                data: data as T,
                provider_key: "stub",
                execution_mode: "stub",
                completed_at_iso: completedAt,
            };
        },
    };
}
