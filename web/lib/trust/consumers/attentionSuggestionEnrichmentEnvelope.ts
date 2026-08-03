/**
 * Envelope adapter — the integration seam.
 *
 * Produces the SAME `AiEnrichmentEnvelopeV1` and the SAME telemetry payload the
 * enrichment route has always returned, except the overlay now comes out of a
 * Decision Package instead of a provider response.
 *
 * Deliberately additive: the legacy `enrichAttentionSuggestionStubEnvelope`
 * path is untouched and still serves the live-provider case, which Slice 1 does
 * not go near.
 */

import { randomUUID } from "crypto";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { parseAiPolicyFromMetadata, type ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type { AiEnrichmentEnvelopeV1, AiTelemetryOutcome, AiUsageTelemetryPayloadV1 } from "@/lib/ai/enrichmentContracts";
import { maybeEmitAiEnrichmentTelemetryEvent } from "@/lib/ai/enrichmentTelemetry";
import { NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE } from "@/lib/ai/enrichAttentionSuggestionStub";
import { captureOutcome } from "@/lib/trust/observation/captureOutcome";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { decideAttentionSuggestionEnrichment } from "@/lib/trust/consumers/attentionSuggestionEnrichment";

export type TrustAttentionEnrichmentInput = {
    readonly org_id: string;
    readonly org_metadata: unknown;
    readonly deterministic: AttentionSuggestionV1 | null;
    readonly correlation_id: string;
    readonly request_id?: string | null;
    readonly operator_id?: string | null;
    readonly repository?: TrustRepository;
    readonly nowIso?: string;
    readonly clock?: () => number;
};

export type TrustAttentionEnrichmentResult = {
    readonly envelope: AiEnrichmentEnvelopeV1;
    readonly telemetry_payload: AiUsageTelemetryPayloadV1;
    readonly telemetry_emitted: boolean;
    readonly decision_package: DecisionPackageV1;
};

function policySnapshot(policy: ResolvedAiOrgPolicyV1): AiEnrichmentEnvelopeV1["policy_snapshot"] {
    return {
        enabled: policy.enabled,
        provider: policy.provider,
        pii_mode: policy.pii_mode,
        allowed_features: policy.allowed_features,
    };
}

/** Maps a Decision Package outcome onto the existing telemetry vocabulary. */
function telemetryOutcomeFor(pkg: DecisionPackageV1): AiTelemetryOutcome {
    switch (pkg.outcome) {
        case "recommended":
            return "stub_success";
        case "refused_policy":
        case "refused_permission":
            return "policy_denied";
        case "refused_insufficient_information":
            return "stub_noop";
        default:
            return "error";
    }
}

/**
 * Runs the enrichment decision through the Trust Runtime and shapes the result
 * for the existing surface.
 *
 * Org policy is evaluated by its existing owner (`parseAiPolicyFromMetadata`)
 * and handed to the runtime as a decided fact — the Trust Runtime records the
 * refusal, it never re-decides authorization.
 */
export async function enrichAttentionSuggestionViaTrustRuntime(
    input: TrustAttentionEnrichmentInput,
): Promise<TrustAttentionEnrichmentResult> {
    const policy = parseAiPolicyFromMetadata(input.org_metadata);
    const repository = input.repository ?? createSupabaseTrustRepository();
    const requestId = (input.request_id ?? randomUUID()).trim() || randomUUID();

    const featureAllowed = policy.enabled && policy.allowed_features.includes("draft_enrichment");

    const decision = await decideAttentionSuggestionEnrichment({
        org_id: input.org_id,
        deterministic: input.deterministic,
        correlation_id: input.correlation_id,
        initiating_actor: input.operator_id
            ? { actor_type: "operator", actor_id: input.operator_id }
            : { actor_type: "system", actor_id: null },
        channel: "operator",
        policy_permits: featureAllowed,
        policy_denial_reason: policy.enabled
            ? "draft_enrichment is not in org ai_policy.allowed_features."
            : "Organization ai_policy.enabled is false.",
        repository,
        nowIso: input.nowIso,
        clock: input.clock,
    });

    const envelope: AiEnrichmentEnvelopeV1 = {
        version: 1,
        deterministic_suggestion: input.deterministic,
        enrichment: decision.enrichment,
        policy_snapshot: policySnapshot(policy),
    };

    const telemetry_payload: AiUsageTelemetryPayloadV1 = {
        schema_version: 1,
        event_kind: "enrichment_request",
        correlation_id: input.correlation_id,
        request_id: requestId,
        org_id: input.org_id,
        entity_type: input.deterministic?.target.entity_type ?? null,
        entity_id: input.deterministic?.target.entity_id ?? null,
        feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
        // No provider participated. Reporting `stub` keeps the existing
        // operator-facing telemetry vocabulary unchanged for this slice.
        provider_key: "stub",
        outcome: telemetryOutcomeFor(decision.package),
        latency_ms: decision.package.economics.latency_ms,
        redaction: {
            steps_total: decision.package.privacy_report.redaction_steps.length,
            kinds: [...new Set(decision.package.privacy_report.redaction_steps.map((s) => s.kind))],
        },
    };

    const { emitted } = await maybeEmitAiEnrichmentTelemetryEvent({
        org_id: input.org_id,
        policy,
        payload: telemetry_payload,
    });

    // The package left the runtime and reached an operator. That is an
    // observation about the package, never a change to it.
    await captureOutcome({
        repository,
        org_id: input.org_id,
        package_id: decision.package.id,
        contract_id: decision.package.contract_id,
        decision_class_key: decision.package.decision_class_key,
        correlation_id: input.correlation_id,
        observation_kind: "presented",
        observed_by_actor_type: input.operator_id ? "operator" : "system",
        observed_by_actor_id: input.operator_id ?? null,
        channel: "operator",
        detail: { outcome: decision.package.outcome },
    });

    return { envelope, telemetry_payload, telemetry_emitted: emitted, decision_package: decision.package };
}
