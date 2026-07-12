/**
 * Zod validation for {@link AttentionSuggestionAiEnrichmentV1} (model JSON only).
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import { z } from "zod";

import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";

const providerKeyZ = z.enum(["disabled", "stub", "openai", "anthropic", "azure_openai"]);
const executionModeZ = z.enum(["disabled", "stub", "live"]);

export const attentionSuggestionAiEnrichmentV1Schema = z
    .object({
        version: z.literal(1),
        agent_key: z.literal(NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY),
        reasoning_summary_overlay: z.string().nullable().optional(),
        suggested_draft_body_overlay: z.string().nullable().optional(),
        tone_variant: z.string().nullable().optional(),
        confidence_notes: z.string().nullable().optional(),
        generated_at_iso: z.string().min(1),
        provider_report: z
            .object({
                provider_key: providerKeyZ,
                execution_mode: executionModeZ,
            })
            .strict(),
    })
    .strict();

export function safeParseAttentionSuggestionAiEnrichmentV1(raw: unknown): AttentionSuggestionAiEnrichmentV1 | null {
    const r = attentionSuggestionAiEnrichmentV1Schema.safeParse(raw);
    return r.success ? (r.data as AttentionSuggestionAiEnrichmentV1) : null;
}
