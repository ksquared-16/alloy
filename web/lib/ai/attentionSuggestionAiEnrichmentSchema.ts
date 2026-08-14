/**
 * Zod validation for {@link AttentionSuggestionAiEnrichmentV1} (model JSON only).
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import { z } from "zod";

import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";
import type {
    AttentionSuggestionAiEnrichmentProviderContentV1,
    AttentionSuggestionAiEnrichmentV1,
} from "@/lib/ai/enrichmentContracts";
import type { AiProviderExecutionMode, AiProviderKey } from "@/lib/ai/providerTypes";

const providerKeyZ = z.enum(["disabled", "stub", "openai", "anthropic", "azure_openai"]);
const executionModeZ = z.enum(["disabled", "stub", "live"]);

const overlayZ = z.string().nullable().optional();

function hasAnyOverlayContent(v: {
    reasoning_summary_overlay?: string | null;
    suggested_draft_body_overlay?: string | null;
}): boolean {
    return Boolean(v.reasoning_summary_overlay?.trim() || v.suggested_draft_body_overlay?.trim());
}

/**
 * The canonical, operator-facing enrichment contract. Unchanged in shape.
 *
 * The `.refine` is a TIGHTENING, never a relaxation (D-83): an enrichment that
 * enriches nothing is not a valid recommendation. Before D-80 this was
 * unreachable — no provider result ever got far enough to be empty — and the
 * operator-visible symptom of an empty overlay was a success-shaped response
 * carrying no content. Refusing it here keeps the registered validator the one
 * authority that decides business validity, instead of the UI discovering
 * emptiness after the fact.
 *
 * Both existing producers (`buildAttentionEnrichmentFromRedactedPayload` and
 * the assembler below) always populate both overlays, so nothing that was valid
 * yesterday becomes invalid today.
 */
export const attentionSuggestionAiEnrichmentV1Schema = z
    .object({
        version: z.literal(1),
        agent_key: z.literal(NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY),
        reasoning_summary_overlay: overlayZ,
        suggested_draft_body_overlay: overlayZ,
        tone_variant: overlayZ,
        confidence_notes: overlayZ,
        generated_at_iso: z.string().min(1),
        provider_report: z
            .object({
                provider_key: providerKeyZ,
                execution_mode: executionModeZ,
            })
            .strict(),
    })
    .strict()
    .refine(hasAnyOverlayContent, {
        message: "Enrichment must carry at least one non-empty overlay.",
        path: ["suggested_draft_body_overlay"],
    });

export function safeParseAttentionSuggestionAiEnrichmentV1(raw: unknown): AttentionSuggestionAiEnrichmentV1 | null {
    const r = attentionSuggestionAiEnrichmentV1Schema.safeParse(raw);
    return r.success ? (r.data as AttentionSuggestionAiEnrichmentV1) : null;
}

/**
 * The provider-output contract: model-owned wording, and nothing else (D-82).
 *
 * `.strict()` here is doing load-bearing work. It is what makes a smuggled
 * `agent_key` or `provider_report` a PARSE FAILURE rather than a field that
 * gets quietly dropped during assembly — a model attempting to state its own
 * identity is refused outright instead of being silently corrected, so the
 * attempt is visible rather than absorbed.
 */
export const attentionSuggestionAiEnrichmentProviderContentV1Schema = z
    .object({
        reasoning_summary_overlay: overlayZ,
        suggested_draft_body_overlay: overlayZ,
        tone_variant: overlayZ,
        confidence_notes: overlayZ,
    })
    .strict();

export function safeParseAttentionSuggestionAiEnrichmentProviderContentV1(
    raw: unknown,
): AttentionSuggestionAiEnrichmentProviderContentV1 | null {
    const r = attentionSuggestionAiEnrichmentProviderContentV1Schema.safeParse(raw);
    return r.success ? (r.data as AttentionSuggestionAiEnrichmentProviderContentV1) : null;
}

/**
 * A human/model-readable declaration of what a provider must return.
 *
 * Derived from the content contract rather than restating it, so the prompt and
 * the parser cannot drift apart — the failure mode this whole slice exists to
 * fix was a validator and a prompt that disagreed about the schema.
 */
export const ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE = [
    "Return a single JSON object with ONLY these keys, all optional, string or null:",
    '"reasoning_summary_overlay", "suggested_draft_body_overlay", "tone_variant", "confidence_notes".',
    "At least one of reasoning_summary_overlay or suggested_draft_body_overlay must be non-empty.",
    "Do NOT include version, agent_key, generated_at_iso, provider_report, or any other key — the caller supplies those and any extra key is rejected.",
    "Overlays are operator-facing suggestions only: no secrets, no raw PII, never instructions to send autonomously.",
].join(" ");

/**
 * Deterministic assembly of the canonical envelope from model-owned content.
 *
 * Every platform-owned field is written from a caller-supplied trusted value,
 * and the content fields are PICKED individually rather than spread. That is
 * deliberate: spreading would make a future added key in the content contract
 * silently able to overwrite `provider_report`, and this function's whole
 * purpose is that the model cannot reach those fields.
 *
 * This performs no validation. The assembled candidate goes to the registered
 * Trust validation policy, which stays the sole business-schema authority.
 */
export function assembleAttentionSuggestionAiEnrichment(input: {
    readonly content: AttentionSuggestionAiEnrichmentProviderContentV1;
    readonly generatedAtIso: string;
    readonly providerKey: AiProviderKey;
    readonly executionMode: AiProviderExecutionMode;
}): AttentionSuggestionAiEnrichmentV1 {
    const { content } = input;
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY,
        reasoning_summary_overlay: content.reasoning_summary_overlay ?? null,
        suggested_draft_body_overlay: content.suggested_draft_body_overlay ?? null,
        tone_variant: content.tone_variant ?? null,
        confidence_notes: content.confidence_notes ?? null,
        generated_at_iso: input.generatedAtIso,
        provider_report: {
            provider_key: input.providerKey,
            execution_mode: input.executionMode,
        },
    };
}
