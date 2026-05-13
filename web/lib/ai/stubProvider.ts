/**
 * Stub structured provider — synthetic overlays only; no network I/O.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type { AiStructuredProvider, AiStructuredRequestV1, AiStructuredResponseV1 } from "@/lib/ai/providerTypes";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";

const FEATURE_NEEDS_ATTENTION_DRAFT = "needs_attention_draft_enrichment";

function hasDraftFeature(policy: ResolvedAiOrgPolicyV1): boolean {
    return policy.allowed_features.includes("draft_enrichment");
}

function buildStubEnrichmentFromRedactedPayload(
    request: AiStructuredRequestV1,
    completedAt: string,
): AttentionSuggestionAiEnrichmentV1 {
    const p = request.payload;
    const nextKey = typeof p.next_action_key === "string" ? p.next_action_key.trim() : "unknown";
    const reason = typeof p.primary_reason_code === "string" ? p.primary_reason_code.trim() : "unknown";
    const templateKey = typeof p.template_key === "string" && p.template_key.trim() ? p.template_key.trim() : "none";
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY,
        reasoning_summary_overlay: `[Stub] ${nextKey} (${reason}) — resolver summary remains source of truth; this line is synthetic copy for UI review only.`,
        suggested_draft_body_overlay: `[Stub] Draft polish placeholder for template "${templateKey}". Original body was redacted before stub generation; do not send.`,
        tone_variant: "neutral_stub",
        confidence_notes: "Synthetic stub enrichment only — no external model.",
        generated_at_iso: completedAt,
        provider_report: { provider_key: "stub", execution_mode: "stub" },
    };
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
            const data = buildStubEnrichmentFromRedactedPayload(request, completedAt);
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
