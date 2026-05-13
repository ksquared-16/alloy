/**
 * TEMPORARY — staging / local UI for exercising `POST /api/admin/ai/enrich-attention-suggestion`.
 * Remove `AiEnrichmentStagingTestButton`, this module, doc references, and `NEXT_PUBLIC_AI_ENRICHMENT_STAGING_TEST_UI`
 * when manual validation is complete.
 */

import { attentionSuggestionAiEnrichmentV1Schema } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";

export type SafeEnrichAttentionTestSummary = {
    status: number;
    provider_key: string | null;
    outcome: string | null;
    has_enrichment: boolean;
    schema_ok: boolean;
    error_code: string | null;
};

/**
 * Visible when running `next dev` (`NODE_ENV !== "production"`) **or** when
 * **`NEXT_PUBLIC_AI_ENRICHMENT_STAGING_TEST_UI`** is `true`/`1`/`yes` (set on non-prod Vercel envs only).
 */
export function isAiEnrichmentStagingTestUiEnabled(): boolean {
    if (process.env.NODE_ENV !== "production") return true;
    const v = process.env.NEXT_PUBLIC_AI_ENRICHMENT_STAGING_TEST_UI?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

type OkJson = {
    ok?: boolean;
    enrichment_telemetry?: { provider_key?: string; outcome?: string };
    provider_error_code?: string | null;
    envelope?: { enrichment?: unknown };
    error?: string;
};

/**
 * Derives a safe summary for console / inline display — never pass raw response JSON to logs wholesale.
 */
export function summarizeEnrichAttentionTestResponse(status: number, json: unknown): SafeEnrichAttentionTestSummary {
    if (json == null || typeof json !== "object" || Array.isArray(json)) {
        return {
            status,
            provider_key: null,
            outcome: null,
            has_enrichment: false,
            schema_ok: false,
            error_code: "INVALID_JSON",
        };
    }
    const j = json as OkJson;
    if (j.ok !== true) {
        const err = typeof j.error === "string" && j.error.trim() ? j.error.trim() : "REQUEST_FAILED";
        return {
            status,
            provider_key: null,
            outcome: null,
            has_enrichment: false,
            schema_ok: false,
            error_code: err,
        };
    }
    const enrichment = j.envelope?.enrichment ?? null;
    const has_enrichment = enrichment != null;
    const tel = j.enrichment_telemetry;
    const provider_key = typeof tel?.provider_key === "string" ? tel.provider_key : null;
    const outcome = typeof tel?.outcome === "string" ? tel.outcome : null;
    const provider_error_code =
        typeof j.provider_error_code === "string" && j.provider_error_code.trim()
            ? j.provider_error_code.trim()
            : null;

    const schema_ok = has_enrichment ? attentionSuggestionAiEnrichmentV1Schema.safeParse(enrichment).success : false;

    return {
        status,
        provider_key,
        outcome,
        has_enrichment,
        schema_ok,
        error_code: provider_error_code,
    };
}
