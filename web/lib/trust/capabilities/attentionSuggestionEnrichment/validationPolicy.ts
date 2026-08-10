/**
 * Registered Trust validation for provider-backed attention enrichment.
 *
 * This is where business-content validity is decided, and moving it here is the
 * substantive change of Phase 2.8. The ungoverned path validated the model's
 * JSON *inside provider transport* — `openAiCompatibleStructuredProvider` parsed
 * the completion and ran the enrichment schema itself, so the component whose
 * only job is HTTP also decided whether an answer was acceptable.
 *
 * That is authority in the wrong layer. Transport cannot be trusted to judge the
 * thing it transported: a provider that returns a plausible shape would be
 * self-certifying. Under the governed stack the adapter normalizes the
 * ENVELOPE only (Phase 2.7), and content validity is decided here, by Trust,
 * after the result has crossed the seam.
 *
 * The schema itself is unchanged and deliberately reused — `.strict()`, so an
 * extra field is a rejection rather than a silently ignored key. That strictness
 * is what makes smuggling a Decision Package field impossible: the model cannot
 * add `trust_score` to its answer and have it survive.
 *
 * **The provider's self-report is not authoritative.** `provider_report` is part
 * of the model's answer and therefore provider-controlled (D-18). It is
 * validated for shape, never believed for telemetry — canonical provider,
 * model and locality come from the adapter's identity, which the model cannot
 * influence.
 */

import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";

export const ATTENTION_ENRICHMENT_VALIDATION_POLICY_KEY = "attention_suggestion_enrichment_result_v1" as const;

export const ATTENTION_ENRICHMENT_VALIDATION_REFUSAL_CODES = [
    /** The model's answer did not satisfy the registered enrichment contract. */
    "ENRICHMENT_RESULT_SCHEMA_REJECTED",
] as const;

export type AttentionEnrichmentValidationRefusalCode =
    (typeof ATTENTION_ENRICHMENT_VALIDATION_REFUSAL_CODES)[number];

export type AttentionEnrichmentValidationResult =
    | { readonly ok: true; readonly enrichment: AttentionSuggestionAiEnrichmentV1 }
    | {
          readonly ok: false;
          readonly refusal_code: AttentionEnrichmentValidationRefusalCode;
          /**
           * Names the contract, never the rejected content. A validation message
           * built from provider output would carry provider-controlled text into
           * durable evidence — the precise thing D-18 forbids.
           */
          readonly detail: string;
      };

/**
 * Decides whether a provider's answer is an acceptable enrichment result.
 *
 * Pure: no I/O, no clock, no provider. Given the same output it always reaches
 * the same verdict, which is what lets a Decision Package be replayed.
 */
export function validateAttentionEnrichmentResult(output: unknown): AttentionEnrichmentValidationResult {
    const parsed = safeParseAttentionSuggestionAiEnrichmentV1(output);
    if (parsed === null) {
        return {
            ok: false,
            refusal_code: "ENRICHMENT_RESULT_SCHEMA_REJECTED",
            detail:
                `Provider output did not satisfy ${ATTENTION_ENRICHMENT_VALIDATION_POLICY_KEY}. ` +
                `The contract is strict: unknown fields, missing required fields and out-of-vocabulary ` +
                `values are all rejected. The rejected content is deliberately not restated here.`,
        };
    }
    return { ok: true, enrichment: parsed };
}
