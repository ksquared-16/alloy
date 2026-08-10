/**
 * Envelope adapter — the integration seam.
 *
 * Produces the SAME `AiEnrichmentEnvelopeV1` and the SAME telemetry payload the
 * enrichment route has always returned, except the overlay now comes out of a
 * Decision Package instead of a provider response.
 *
 * As of Phase 2.8 Gate C this serves BOTH reasoning modes. The envelope, the
 * telemetry payload and the operator's experience are the same on either; what
 * differs is which decision class the capability submitted, and therefore
 * whether a provider participated at all.
 *
 * The legacy `enrichAttentionSuggestionStubEnvelope` still exists but no longer
 * serves the live-provider case. Retiring it — and making it structurally
 * unreachable rather than merely uncalled — is Gate D (D-45).
 */

import { randomUUID } from "crypto";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { parseAiPolicyFromMetadata, type ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type { AiEnrichmentEnvelopeV1, AiTelemetryOutcome, AiUsageTelemetryPayloadV1 } from "@/lib/ai/enrichmentContracts";
import { maybeEmitAiEnrichmentTelemetryEvent } from "@/lib/ai/enrichmentTelemetry";
import { NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE } from "@/lib/ai/enrichAttentionSuggestionStub";
import { asAiProviderKey } from "@/lib/ai/providerTypes";
import type { TrustAuthorizationDecision } from "@/lib/trust/authorization/trustAuthorizationDecision";
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
    /**
     * Resolved by the authorization authority before this seam is reached.
     * Trust records the verdict; it never re-decides authorization, and it no
     * longer re-derives feature policy from org metadata.
     */
    readonly authorization: TrustAuthorizationDecision;
    readonly repository?: TrustRepository;
    readonly nowIso?: string;
    readonly clock?: () => number;
};

export type TrustAttentionEnrichmentResult = {
    readonly envelope: AiEnrichmentEnvelopeV1;
    readonly telemetry_payload: AiUsageTelemetryPayloadV1;
    readonly telemetry_emitted: boolean;
    readonly decision_package: DecisionPackageV1;
    /** Which governed question executed. Reported, never chosen here. */
    readonly reasoning_mode: "deterministic_local" | "provider_backed";
};

function policySnapshot(policy: ResolvedAiOrgPolicyV1): AiEnrichmentEnvelopeV1["policy_snapshot"] {
    return {
        enabled: policy.enabled,
        provider: policy.provider,
        pii_mode: policy.pii_mode,
        allowed_features: policy.allowed_features,
    };
}

/**
 * Maps a Decision Package outcome onto the existing telemetry vocabulary.
 *
 * `providerParticipated` distinguishes the two success values, and it is an
 * OBSERVED fact — whether the port reported an identity — not the org policy's
 * configured provider. The distinction is the point: policy records what was
 * asked for, and a governed execution that refused before reaching transport
 * had no provider participate however the org is configured.
 *
 * The legacy path reached `live_success` by comparing a resolved provider key to
 * a literal. This reaches the same value from the same underlying fact, without
 * either module naming a vendor.
 */
function telemetryOutcomeFor(pkg: DecisionPackageV1, providerParticipated: boolean): AiTelemetryOutcome {
    switch (pkg.outcome) {
        case "recommended":
            return providerParticipated ? "live_success" : "stub_success";
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

    const decision = await decideAttentionSuggestionEnrichment({
        org_id: input.org_id,
        deterministic: input.deterministic,
        correlation_id: input.correlation_id,
        initiating_actor: input.operator_id
            ? { actor_type: "operator", actor_id: input.operator_id }
            : { actor_type: "system", actor_id: null },
        channel: "operator",
        authorization: input.authorization,
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

    // Provider identity, from what ANSWERED rather than from what was
    // configured (D-44). Absent when no provider participated, which is the
    // deterministic path and every provider-backed execution that refused
    // before transport.
    //
    // A reported identity outside the operator-facing vocabulary is not
    // renamed: `asAiProviderKey` returns null and this falls back to the org
    // policy's provider, which is a fact about configuration and is at least
    // true of what was asked for. `provider_key` is set by local configuration
    // and never by the provider, so this is unreachable today — it exists so a
    // future deployment cannot make telemetry lie by widening the port.
    const observedProviderKey = decision.provider_execution
        ? asAiProviderKey(decision.provider_execution.identity.provider_key)
        : null;
    const providerParticipated = decision.provider_execution != null;

    const telemetry_payload: AiUsageTelemetryPayloadV1 = {
        schema_version: 1,
        event_kind: "enrichment_request",
        correlation_id: input.correlation_id,
        request_id: requestId,
        org_id: input.org_id,
        entity_type: input.deterministic?.target.entity_type ?? null,
        entity_id: input.deterministic?.target.entity_id ?? null,
        feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
        // `stub` when nothing reached a provider — the deterministic path sends
        // nowhere, and that has been the reported value since Slice 1.
        provider_key: providerParticipated ? (observedProviderKey ?? policy.provider) : "stub",
        outcome: telemetryOutcomeFor(decision.package, providerParticipated),
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

    return {
        envelope,
        telemetry_payload,
        telemetry_emitted: emitted,
        decision_package: decision.package,
        reasoning_mode: decision.reasoning_mode,
    };
}
