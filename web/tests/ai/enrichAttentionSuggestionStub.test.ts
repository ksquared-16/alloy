import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY } from "@/lib/agent/needsAttentionSuggestion/types";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { enrichAttentionSuggestionStubEnvelope, NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE } from "@/lib/ai/enrichAttentionSuggestionStub";
import { maybeEmitAiEnrichmentTelemetryEvent, shouldEmitAiEnrichmentTelemetry } from "@/lib/ai/enrichmentTelemetry";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import * as RedactionMod from "@/lib/privacy/redactObject";
import { createAiProviderForPolicy } from "@/lib/ai/disabledProvider";
import { aiUsageTelemetryPayloadV1ToJson } from "@/lib/ai/enrichmentContracts";

const emitEventMock = vi.hoisted(() => vi.fn(async () => "evt-1"));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...(args as [])),
}));

function suggestionWithSecretDraft(secret: string): AttentionSuggestionV1 {
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
        suggestion_id: "a".repeat(48),
        target: { entity_type: "opportunities", entity_id: "opp-99" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 2,
            primary_reason_code: "stale_new_inquiry",
            reason_codes: ["stale_new_inquiry"],
        },
        next_action: {
            key: "respond_to_new_request",
            label: "Respond",
            action_family: "follow_up",
            confidence: "deterministic",
        },
        reasoning: { summary: "Stale inquiry.", factors: [] },
        suggested_content: {
            channel: "email",
            template_key: "generic_follow_up_short",
            body: `Hello — ${secret}`,
            variables: { contact_name: "there", record_ref: "ref" },
        },
        generated_at_iso: "2026-05-13T12:00:00.000Z",
    };
}

describe("enrichAttentionSuggestionStubEnvelope", () => {
    beforeEach(() => {
        emitEventMock.mockClear();
        vi.unstubAllEnvs();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("returns null enrichment when stub env is off (policy on)", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        const policyMeta = {
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        };
        const r = await enrichAttentionSuggestionStubEnvelope({
            org_id: "org-1",
            org_metadata: policyMeta,
            deterministic: suggestionWithSecretDraft("SECRET_DRAFT_XYZ"),
            correlation_id: "corr-a",
        });
        expect(r.envelope.enrichment).toBeNull();
        expect(r.telemetry_payload.outcome).toBe("disabled");
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("requires stub env and org stub policy for enrichment", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const policyMeta = {
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        };
        const r = await enrichAttentionSuggestionStubEnvelope({
            org_id: "org-1",
            org_metadata: policyMeta,
            deterministic: suggestionWithSecretDraft("SECRET_DRAFT_XYZ"),
            correlation_id: "corr-b",
        });
        expect(r.envelope.enrichment).not.toBeNull();
        expect(r.envelope.enrichment?.reasoning_summary_overlay).toContain("[Stub]");
        expect(r.telemetry_payload.outcome).toBe("stub_success");
        const telJson = JSON.stringify(aiUsageTelemetryPayloadV1ToJson(r.telemetry_payload));
        expect(telJson).not.toContain("SECRET_DRAFT_XYZ");
        expect(telJson).not.toContain("Hello");
    });

    it("OpenAI path: strict live flag + credentials yields live telemetry (mock fetch)", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("OPENAI_API_KEY", "sk-test");
        vi.stubEnv("OPENAI_MODEL", "gpt-test");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    version: 1,
                                    agent_key: "needs_attention_suggestion_enrichment",
                                    reasoning_summary_overlay: "Live overlay",
                                    generated_at_iso: "2026-05-13T12:00:00.000Z",
                                    provider_report: { provider_key: "openai", execution_mode: "live" },
                                }),
                            },
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policyMeta = {
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "openai",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        };
        const r = await enrichAttentionSuggestionStubEnvelope({
            org_id: "org-1",
            org_metadata: policyMeta,
            deterministic: suggestionWithSecretDraft("SECRET_LIVE"),
            correlation_id: "corr-openai",
            openai_live_invocation_permitted: true,
        });
        expect(r.envelope.enrichment?.provider_report.execution_mode).toBe("live");
        expect(r.envelope.enrichment?.reasoning_summary_overlay).toContain("Live overlay");
        expect(r.telemetry_payload.outcome).toBe("live_success");
        expect(r.telemetry_payload.provider_key).toBe("openai");
        const telJson = JSON.stringify(aiUsageTelemetryPayloadV1ToJson(r.telemetry_payload));
        expect(telJson).not.toContain("SECRET_LIVE");
    });

    it("runs redaction before stub (draft body not passed verbatim to stub strings)", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const spy = vi.spyOn(RedactionMod, "redactObjectForAi");
        const policyMeta = {
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        };
        await enrichAttentionSuggestionStubEnvelope({
            org_id: "org-1",
            org_metadata: policyMeta,
            deterministic: suggestionWithSecretDraft("PII_IN_DRAFT"),
            correlation_id: "corr-c",
        });
        expect(spy).toHaveBeenCalled();
        const firstArg = spy.mock.calls[0]![0] as Record<string, unknown>;
        expect(firstArg.draft_body).toContain("PII_IN_DRAFT");
        const redactedPayload = spy.mock.results[0]!.value as { redacted: Record<string, unknown> };
        expect(String(redactedPayload.redacted.draft_body)).not.toBe(String(firstArg.draft_body));
        spy.mockRestore();
    });

    it("emits workflow_events only when telemetry env and verbose logging", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        vi.stubEnv("AI_ENRICHMENT_TELEMETRY_ENABLED", "true");
        const policyVerbose = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
                logging_mode: "verbose",
            },
        });
        expect(shouldEmitAiEnrichmentTelemetry(policyVerbose)).toBe(true);

        const payload = {
            schema_version: 1 as const,
            event_kind: "enrichment_request" as const,
            correlation_id: "c1",
            org_id: "org-1",
            entity_type: "opportunities" as const,
            entity_id: "opp-1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            provider_key: "stub" as const,
            outcome: "stub_success" as const,
            latency_ms: 3,
            redaction: { steps_total: 1, kinds: ["freeform_note"] },
        };
        const { emitted } = await maybeEmitAiEnrichmentTelemetryEvent({
            org_id: "org-1",
            policy: policyVerbose,
            payload,
        });
        expect(emitted).toBe(true);
        expect(emitEventMock).toHaveBeenCalledTimes(1);
        const first = (emitEventMock.mock.calls as unknown as [[{ event_type?: string; payload?: Record<string, unknown> }]])[0];
        const arg = first[0];
        expect(arg.event_type).toBe("ai_enrichment_usage_v1");
        expect(JSON.stringify(arg.payload)).not.toContain("PII");

        emitEventMock.mockClear();
        const policyMinimal = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        });
        const { emitted: em2 } = await maybeEmitAiEnrichmentTelemetryEvent({
            org_id: "org-1",
            policy: policyMinimal,
            payload,
        });
        expect(em2).toBe(false);
        expect(emitEventMock).not.toHaveBeenCalled();
    });
});

describe("createAiProviderForPolicy stub path", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => vi.unstubAllEnvs());

    it("returns policy_denied envelope from stub when draft feature is not allowed", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: [],
            },
        });
        const prov = createAiProviderForPolicy(policy);
        expect(prov.key).toBe("stub");
        const res = await prov.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "o1",
            payload: { next_action_key: "k", primary_reason_code: "r", template_key: "t" },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("policy_denied");
        expect(res.error?.code).toBe("POLICY_DENIED");
        expect(res.data).toBeUndefined();
    });

    it("returns stub provider when env and org policy allow", async () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "stub",
                allowed_features: ["draft_enrichment"],
            },
        });
        const prov = createAiProviderForPolicy(policy);
        expect(prov.key).toBe("stub");
        const res = await prov.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "o1",
            payload: { next_action_key: "k", primary_reason_code: "r", template_key: "t" },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("ok");
        expect(res.data?.reasoning_summary_overlay).toContain("[Stub]");
    });
});
