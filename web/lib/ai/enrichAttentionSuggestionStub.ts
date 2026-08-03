import { randomUUID } from "crypto";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { parseAiPolicyFromMetadata, type ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { redactObjectForAi } from "@/lib/privacy/redactObject";
import { resolveStructuredAiProviderForPolicy } from "@/lib/ai/resolveStructuredAiProvider";
import type { AiProviderErrorEnvelope, AiProviderKey, AiStructuredRequestV1 } from "@/lib/ai/providerTypes";
import type {
    AiEnrichmentEnvelopeV1,
    AiUsageTelemetryPayloadV1,
    AttentionSuggestionAiEnrichmentV1,
    AiTelemetryOutcome,
} from "@/lib/ai/enrichmentContracts";
import { maybeEmitAiEnrichmentTelemetryEvent } from "@/lib/ai/enrichmentTelemetry";

/** Stable feature key for needs-attention stub enrichment. */
export const NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE = "needs_attention_draft_enrichment" as const;

export type EnrichAttentionSuggestionStubInput = {
    org_id: string;
    /** Typically `org_settings.metadata` JSON (must include `ai_policy` subtree when enabled). */
    org_metadata: unknown;
    deterministic: AttentionSuggestionV1 | null;
    correlation_id: string;
    request_id?: string | null;
    /**
     * When true, routes assert strict `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` + `ai.enrichment.use` grant
     * before calling OpenAI-compatible live enrichment (`ai_policy.provider === "openai"`).
     */
    openai_live_invocation_permitted?: boolean;
};

export type EnrichAttentionSuggestionStubResult = {
    envelope: AiEnrichmentEnvelopeV1;
    telemetry_payload: AiUsageTelemetryPayloadV1;
    telemetry_emitted: boolean;
    /** When the structured provider returns a non-ok outcome (diagnostics only; not sent to clients). */
    provider_last_error_code?: string | null;
    /** Full last provider error (server / local tools); HTTP route does not return this field. */
    provider_last_error?: AiProviderErrorEnvelope | null;
};

function policySnapshot(policy: ResolvedAiOrgPolicyV1): AiEnrichmentEnvelopeV1["policy_snapshot"] {
    return {
        enabled: policy.enabled,
        provider: policy.provider,
        pii_mode: policy.pii_mode,
        allowed_features: policy.allowed_features,
    };
}

function uniqueKinds(kinds: readonly string[]): string[] {
    return [...new Set(kinds)];
}

function mapTelemetryOutcome(providerOutcome: string, hasEnrichment: boolean, providerKey: AiProviderKey): AiTelemetryOutcome {
    if (providerOutcome === "ok" && hasEnrichment && providerKey === "openai") return "live_success";
    if (providerOutcome === "ok" && hasEnrichment) return "stub_success";
    if (providerOutcome === "ok" && !hasEnrichment) return "stub_noop";
    if (providerOutcome === "policy_denied") return "policy_denied";
    if (providerOutcome === "disabled") return "disabled";
    if (providerOutcome === "timeout" || providerOutcome === "error") return "error";
    return "error";
}

function buildTelemetryPayload(input: {
    org_id: string;
    correlation_id: string;
    request_id: string;
    feature: string;
    provider_key: AiProviderKey;
    outcome: AiTelemetryOutcome;
    steps: readonly { kind: string }[];
    latency_ms: number;
    entity_type: string | null;
    entity_id: string | null;
}): AiUsageTelemetryPayloadV1 {
    const kinds = uniqueKinds(input.steps.map((s) => s.kind));
    return {
        schema_version: 1,
        event_kind: "enrichment_request",
        correlation_id: input.correlation_id,
        request_id: input.request_id,
        org_id: input.org_id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        feature: input.feature,
        provider_key: input.provider_key,
        outcome: input.outcome,
        latency_ms: input.latency_ms,
        redaction: { steps_total: input.steps.length, kinds },
    };
}

/**
 * Builds {@link AiEnrichmentEnvelopeV1} using org policy + stub provider (when env + policy allow).
 * Always runs {@link redactObjectForAi} on an internal payload **before** invoking the structured provider
 * (stub or disabled).
 */
export async function enrichAttentionSuggestionStubEnvelope(
    input: EnrichAttentionSuggestionStubInput,
): Promise<EnrichAttentionSuggestionStubResult> {
    const policy = parseAiPolicyFromMetadata(input.org_metadata);
    const snapshot = policySnapshot(policy);
    const t0 = Date.now();

    if (!input.deterministic) {
        const envelope: AiEnrichmentEnvelopeV1 = {
            version: 1,
            deterministic_suggestion: null,
            enrichment: null,
            policy_snapshot: snapshot,
        };
        const telemetry_payload = buildTelemetryPayload({
            org_id: input.org_id,
            correlation_id: input.correlation_id,
            request_id: input.request_id ?? randomUUID(),
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            provider_key: "disabled",
            outcome: "stub_noop",
            steps: [],
            latency_ms: Date.now() - t0,
            entity_type: null,
            entity_id: null,
        });
        const { emitted } = await maybeEmitAiEnrichmentTelemetryEvent({
            org_id: input.org_id,
            policy,
            payload: telemetry_payload,
        });
        return {
            envelope,
            telemetry_payload,
            telemetry_emitted: emitted,
            provider_last_error_code: null,
            provider_last_error: null,
        };
    }

    const det = input.deterministic;
    const rawForRedaction: Record<string, unknown> = {
        primary_reason_code: det.source.primary_reason_code,
        next_action_key: det.next_action.key,
        template_key: det.suggested_content?.template_key ?? null,
        channel: det.suggested_content?.channel ?? null,
        reasoning_summary: det.reasoning.summary,
        draft_body: det.suggested_content?.body ?? null,
    };

    const { redacted, steps } = redactObjectForAi(rawForRedaction, { pii_mode: policy.pii_mode });

    const provider = resolveStructuredAiProviderForPolicy(policy, {
        openai_live_invocation_permitted: input.openai_live_invocation_permitted === true,
    });
    const request: AiStructuredRequestV1 = {
        schema_version: 1,
        request_id: (input.request_id ?? randomUUID()).trim() || randomUUID(),
        correlation_id: input.correlation_id,
        feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
        org_id: input.org_id,
        payload: redacted,
        requested_at_iso: new Date().toISOString(),
    };

    const res = await provider.completeStructured<AttentionSuggestionAiEnrichmentV1>(request);
    const latency_ms = Date.now() - t0;

    const enrichment: AttentionSuggestionAiEnrichmentV1 | null = res.outcome === "ok" && res.data ? res.data : null;

    const envelope: AiEnrichmentEnvelopeV1 = {
        version: 1,
        deterministic_suggestion: det,
        enrichment,
        policy_snapshot: snapshot,
    };

    const telemetry_payload = buildTelemetryPayload({
        org_id: input.org_id,
        correlation_id: input.correlation_id,
        request_id: request.request_id,
        feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
        provider_key: res.provider_key,
        outcome: mapTelemetryOutcome(res.outcome, enrichment != null, res.provider_key),
        steps,
        latency_ms,
        entity_type: det.target.entity_type,
        entity_id: det.target.entity_id,
    });

    const { emitted } = await maybeEmitAiEnrichmentTelemetryEvent({
        org_id: input.org_id,
        policy,
        payload: telemetry_payload,
    });

    const provider_last_error: AiProviderErrorEnvelope | null = res.outcome !== "ok" ? (res.error ?? null) : null;
    const provider_last_error_code = provider_last_error?.code ?? null;

    return { envelope, telemetry_payload, telemetry_emitted: emitted, provider_last_error_code, provider_last_error };
}
