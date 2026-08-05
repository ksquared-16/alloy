/**
 * Deterministic Reasoning Strategy for `attention_suggestion_enrichment`.
 *
 * Under Decision 019 a deterministic strategy executed inside an explicitly
 * submitted Decision Contract is valid Trust Runtime execution. This strategy
 * performs no I/O, resolves no provider and sends nothing anywhere.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 019
 */

import {
    ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import type { ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { buildAttentionEnrichmentFromRedactedPayload } from "@/lib/trust/reasoning/strategies/attentionEnrichmentProposal";

export { ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY };

export const attentionSuggestionEnrichmentDeterministicStrategy: ReasoningStrategyV1 = {
    key: ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY,
    kind: "deterministic",
    version: "1.0.0",
    decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,

    reason({ context, nowIso }): ReasoningOutcome {
        const transformed = context.transformed;
        const nextActionKey = typeof transformed.next_action_key === "string" ? transformed.next_action_key.trim() : "";
        const primaryReasonCode =
            typeof transformed.primary_reason_code === "string" ? transformed.primary_reason_code.trim() : "";

        if (!nextActionKey || !primaryReasonCode) {
            return {
                ok: false,
                refusal_code: "REASONING_UNABLE",
                detail:
                    "The prepared reasoning context carries no next action or no primary reason code, so no wording proposal can be grounded.",
            };
        }

        const recommendation = buildAttentionEnrichmentFromRedactedPayload(transformed, nowIso);

        const evidence = [
            {
                kind: "deterministic_rule" as const,
                reference: ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY,
                detail: "Overlay wording is derived by fixed rule from the resolver's next action, primary reason and template key.",
            },
            {
                kind: "authoritative_record" as const,
                reference: `attention.primary_reason_code:${primaryReasonCode}`,
                detail: "Primary reason code supplied by the deterministic attention resolver, which remains authoritative.",
            },
            {
                kind: "authoritative_record" as const,
                reference: `attention.next_action_key:${nextActionKey}`,
                detail: "Next action key supplied by the deterministic attention resolver.",
            },
        ];

        const remaining: string[] = [
            "This overlay is wording only. The resolver's own summary and next action remain the operational source of truth.",
        ];
        if (context.redaction_steps.length > 0) {
            remaining.push(
                `Reasoning saw a minimized context: ${context.redaction_steps.length} element(s) were transformed before reasoning.`,
            );
        }

        return {
            ok: true,
            proposal: {
                recommendation: recommendation as unknown as Record<string, unknown>,
                // A fixed rule over present inputs is fully certain about what it
                // produced. Certainty about the wording is NOT operational trust —
                // Trust Governance evaluates that separately.
                confidence: 1,
                evidence,
                explanation:
                    "Deterministic wording overlay derived from the resolver's next action and primary reason. No model, no provider, no external call.",
                remaining_uncertainty: remaining,
            },
        };
    },
};
