#!/usr/bin/env npx tsx
/**
 * Local-only live OpenAI enrichment smoke check (not imported by the app).
 *
 * Run from `web/`: `npm run validate:ai-openai-local`
 *
 * Requires `web/.env.local` (server vars): `AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`,
 * `OPENAI_API_KEY`, `OPENAI_MODEL` (optional `OPENAI_BASE_URL`, optional **`OPENAI_REQUEST_TIMEOUT_MS`**
 * — default **20000**, max **30000**; see **`getOpenAiStructuredRequestTimeoutMs`**). Refuses `NODE_ENV=production`.
 *
 * **Remove this script** (and the npm script + doc section) once staging validation is done.
 */

import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import {
    NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
    type AttentionSuggestionV1,
} from "@/lib/agent/needsAttentionSuggestion/types";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { attentionSuggestionAiEnrichmentV1Schema } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { isAiEnrichmentUsePermissionRequired } from "@/lib/ai/aiEnrichmentPermissions";
import { getOpenAiBaseUrl, getOpenAiModel, hasOpenAiStructuredCredentials } from "@/lib/ai/aiEnrichmentEnv";
import { enrichAttentionSuggestionStubEnvelope } from "@/lib/ai/enrichAttentionSuggestionStub";

/** Synthetic fixture — same contract as route `deterministic_suggestion`; not a real org row. */
export const AttentionSuggestionV1Fixture: AttentionSuggestionV1 = {
    version: 1,
    agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
    suggestion_id: "00000000-0000-4000-8000-00000000feed",
    target: {
        entity_type: "opportunities",
        entity_id: "00000000-0000-4000-8000-00000000cafe",
    },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 1,
        primary_reason_code: "local_validation_fixture",
        reason_codes: ["local_validation_fixture"],
    },
    next_action: {
        key: "fixture_follow_up",
        label: "Follow up",
        action_family: "follow_up",
        confidence: "deterministic",
    },
    reasoning: {
        summary: "Fixture summary for local OpenAI validation only.",
        factors: [{ code: "fixture", label: "Fixture factor" }],
    },
    suggested_content: {
        channel: "email",
        template_key: "fixture_template",
        body: "Fixture draft line for redaction + model output checks.",
        variables: {},
    },
    generated_at_iso: "2026-05-13T00:00:00.000Z",
};

type SafeSummary = {
    provider_key: string;
    outcome: string;
    has_enrichment: boolean;
    schema_ok: boolean;
    redaction_steps: number;
    error_code: string | null;
    http_status: number | null;
    openai_error_type: string | null;
    openai_error_code: string | null;
    openai_error_message: string | null;
    model: string | null;
    base_url_host: string | null;
};

function openAiBaseUrlHostOnly(): string | null {
    const raw = getOpenAiBaseUrl().trim();
    if (!raw) return null;
    try {
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        return new URL(withProto).host;
    } catch {
        return null;
    }
}

function printSummary(s: SafeSummary): void {
    process.stdout.write(`${JSON.stringify(s)}\n`);
}

function emptyDiagnosticsSummary(partial: Partial<SafeSummary> & Pick<SafeSummary, "provider_key" | "outcome">): SafeSummary {
    return {
        provider_key: partial.provider_key,
        outcome: partial.outcome,
        has_enrichment: partial.has_enrichment ?? false,
        schema_ok: partial.schema_ok ?? false,
        redaction_steps: partial.redaction_steps ?? 0,
        error_code: partial.error_code ?? null,
        http_status: partial.http_status ?? null,
        openai_error_type: partial.openai_error_type ?? null,
        openai_error_code: partial.openai_error_code ?? null,
        openai_error_message: partial.openai_error_message ?? null,
        model: partial.model ?? null,
        base_url_host: partial.base_url_host ?? null,
    };
}

async function main(): Promise<void> {
    loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

    const modelConfigured = getOpenAiModel().trim() || null;
    const baseHost = openAiBaseUrlHostOnly();

    if (process.env.NODE_ENV === "production") {
        printSummary(
            emptyDiagnosticsSummary({
                provider_key: "n/a",
                outcome: "script_refused",
                error_code: "PRODUCTION_NODE_ENV",
            }),
        );
        process.exit(1);
    }

    if (!isAiEnrichmentUsePermissionRequired() || !hasOpenAiStructuredCredentials()) {
        printSummary(
            emptyDiagnosticsSummary({
                provider_key: "n/a",
                outcome: "script_refused",
                error_code: "MISSING_STRICT_OPENAI_ENV",
                model: modelConfigured,
                base_url_host: baseHost,
            }),
        );
        process.exit(1);
    }

    const org_id = "00000000-0000-4000-8000-00000000babe";
    const org_metadata = {
        [AI_POLICY_METADATA_KEY]: {
            enabled: true,
            provider: "openai",
            allowed_features: ["draft_enrichment"],
            logging_mode: "minimal",
        },
    };

    const result = await enrichAttentionSuggestionStubEnvelope({
        org_id,
        org_metadata,
        deterministic: AttentionSuggestionV1Fixture,
        correlation_id: randomUUID(),
        openai_live_invocation_permitted: true,
    });

    const enrichment = result.envelope.enrichment;
    const has_enrichment = enrichment != null;
    const schema_ok = has_enrichment ? attentionSuggestionAiEnrichmentV1Schema.safeParse(enrichment).success : false;

    const pe = result.provider_last_error;
    const oh = pe?.openai_http;

    const error_code =
        result.provider_last_error_code ??
        (result.telemetry_payload.outcome === "error" ? "TELEMETRY_ERROR_OUTCOME" : null);

    printSummary({
        provider_key: result.telemetry_payload.provider_key,
        outcome: result.telemetry_payload.outcome,
        has_enrichment,
        schema_ok,
        redaction_steps: result.telemetry_payload.redaction?.steps_total ?? 0,
        error_code,
        http_status: oh?.http_status ?? null,
        openai_error_type: oh?.openai_error_type ?? null,
        openai_error_code: oh?.openai_error_code ?? null,
        openai_error_message: oh?.openai_error_message ?? null,
        model: modelConfigured,
        base_url_host: baseHost,
    });

    const ok = has_enrichment && schema_ok && result.telemetry_payload.outcome === "live_success";
    process.exit(ok ? 0 : 1);
}

main().catch(() => {
    printSummary(
        emptyDiagnosticsSummary({
            provider_key: "n/a",
            outcome: "script_exception",
            error_code: "UNHANDLED_EXCEPTION",
            model: getOpenAiModel().trim() || null,
            base_url_host: openAiBaseUrlHostOnly(),
        }),
    );
    process.exit(1);
});
