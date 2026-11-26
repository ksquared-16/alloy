/**
 * Deterministic attention-enrichment proposal builder.
 *
 * Moved verbatim from `lib/ai/stubProvider.ts`. This is the single
 * implementation: the legacy stub provider now calls it, and so does the Trust
 * Runtime's deterministic Reasoning Strategy. Operator-facing output is
 * therefore identical by construction rather than by assertion.
 *
 * @see docs/platform/trust/reasoning-runtime.md
 */

import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";

/**
 * Builds the enrichment overlay from an already-redacted payload.
 *
 * `provider_report` reports `stub` because that is the existing operator-facing
 * contract and Slice 1 preserves it byte for byte. No provider is involved:
 * this function performs no I/O.
 */
export function buildAttentionEnrichmentFromRedactedPayload(
    payload: Readonly<Record<string, unknown>>,
    completedAtIso: string,
): AttentionSuggestionAiEnrichmentV1 {
    const p = payload;
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
        generated_at_iso: completedAtIso,
        provider_report: { provider_key: "stub", execution_mode: "stub" },
    };
}
