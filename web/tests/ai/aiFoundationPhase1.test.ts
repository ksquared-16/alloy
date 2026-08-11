import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    AI_POLICY_METADATA_KEY,
    createDisabledAiProvider,
    NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
    parseAiPolicyFromMetadata,
    redactObjectForAi,
    safeParseAiUsageTelemetryPayloadV1,
    aiUsageTelemetryPayloadV1ToJson,
    aiEnrichmentEnvelopeV1ToJson,
} from "@/lib/ai";
import type { AiStructuredRequestV1 } from "@/lib/ai/providerTypes";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

const minimalSuggestion = (): AttentionSuggestionV1 => ({
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "x".repeat(48),
    target: { entity_type: "opportunities", entity_id: "opp-1" },
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
    reasoning: { summary: "Stale.", factors: [] },
    suggested_content: null,
    generated_at_iso: "2026-05-13T12:00:00.000Z",
});

describe("parseAiPolicyFromMetadata", () => {
    it("defaults to disabled when metadata missing ai_policy", () => {
        const p = parseAiPolicyFromMetadata({});
        expect(p.enabled).toBe(false);
        expect(p.provider).toBe("disabled");
        expect(p.allowed_features.length).toBe(0);
        expect(p.pii_mode).toBe("strict");
    });

    it("defaults when ai_policy not an object", () => {
        const p = parseAiPolicyFromMetadata({ [AI_POLICY_METADATA_KEY]: "nope" });
        expect(p.enabled).toBe(false);
    });

    it("normalizes enabled org policy and filters unknown features", () => {
        const p = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "openai",
                allowed_features: ["draft_enrichment", "unknown_feature"],
                pii_mode: "standard",
                logging_mode: "verbose",
                retention_mode: "ephemeral",
            },
        });
        expect(p.enabled).toBe(true);
        expect(p.provider).toBe("openai");
        expect(p.allowed_features).toEqual(["draft_enrichment"]);
        expect(p.pii_mode).toBe("standard");
        expect(p.logging_mode).toBe("verbose");
        expect(p.retention_mode).toBe("ephemeral");
    });

    it("forces features off when enabled is false", () => {
        const p = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: false,
                provider: "openai",
                allowed_features: ["draft_enrichment"],
            },
        });
        expect(p.enabled).toBe(false);
        expect(p.allowed_features.length).toBe(0);
    });

    it("maps enabled + provider disabled to stub preference", () => {
        const p = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "disabled",
                allowed_features: ["draft_enrichment"],
            },
        });
        expect(p.enabled).toBe(true);
        expect(p.provider).toBe("stub");
    });
});

describe("createDisabledAiProvider", () => {
    it("returns disabled outcome without data", async () => {
        const p = createDisabledAiProvider();
        const req: AiStructuredRequestV1 = {
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: "test",
            org_id: "org-1",
            payload: { a: 1 },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        };
        const res = await p.completeStructured(req);
        expect(res.outcome).toBe("disabled");
        expect(res.provider_key).toBe("disabled");
        expect(res.error?.code).toBe("AI_PROVIDER_DISABLED");
    });
});

/**
 * Phase 2.8 Gate D deleted `createAiProviderForPolicy` and everything it could
 * resolve. This block used to prove that the resolver returned the ungoverned
 * OpenAI-compatible provider under strict mode with credentials — which is now
 * the opposite of what must be true, because that provider no longer exists.
 *
 * The proof that replaced it is architectural rather than behavioural and lives
 * in `tests/trust/ungovernedEgressRetired.test.ts`: no module outside the
 * governed adapter can reach a reasoning provider at all. A behavioural test
 * could only show that one particular caller does not; a structural scan shows
 * that no caller could.
 *
 * What survives here is the part that never depended on egress: a disabled
 * provider still refuses.
 */
describe("structured provider surface after Gate D", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("an org policy naming a provider can no longer resolve one — the barrel exports no resolver", async () => {
        const barrel: Record<string, unknown> = await import("@/lib/ai");
        expect(barrel.createAiProviderForPolicy).toBeUndefined();
        expect(barrel.resolveStructuredAiProviderForPolicy).toBeUndefined();
        expect(barrel.enrichAttentionSuggestionStubEnvelope).toBeUndefined();
    });

    it("the disabled provider still refuses, unchanged", async () => {
        const res = await createDisabledAiProvider().completeStructured({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "o1",
            payload: {},
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("disabled");
        expect(res.data).toBeUndefined();
    });
});

describe("redactObjectForAi", () => {
    it("redacts known PII keys and records steps", () => {
        const { redacted, steps } = redactObjectForAi({
            child_name: "Jordan Smith",
            parent_email: "parent@example.com",
            phone: "5551234567",
            notes: "Please call the family about the tour.",
            quote_total: 1200,
            safe_key: "visible",
        });
        expect(redacted.safe_key).toBe("visible");
        expect(String(redacted.child_name)).toContain("…");
        expect(String(redacted.parent_email)).toContain("@");
        expect(String(redacted.parent_email)).toContain("redacted");
        expect(String(redacted.phone)).toContain("***");
        expect(redacted.notes).toMatch(/redacted/);
        expect(redacted.quote_total).toBe("[financial]");
        expect(steps.length).toBeGreaterThan(0);
    });

    it("respects pii_mode none by skipping name and email redaction", () => {
        const { redacted, steps } = redactObjectForAi(
            { first_name: "Taylor", email: "t@example.com" },
            { pii_mode: "none" },
        );
        expect(redacted.first_name).toBe("Taylor");
        expect(redacted.email).toBe("t@example.com");
        expect(steps.length).toBe(0);
    });

    it("still redacts notes and financial fields in pii_mode none", () => {
        const { redacted, steps } = redactObjectForAi(
            { notes: "secret text", quote_total: 99 },
            { pii_mode: "none" },
        );
        expect(String(redacted.notes)).toMatch(/redacted/);
        expect(redacted.quote_total).toBe("[financial]");
        expect(steps.length).toBeGreaterThanOrEqual(2);
    });
});

describe("AiUsageTelemetryPayloadV1 schema", () => {
    it("round-trips valid payloads", () => {
        const payload = {
            schema_version: 1 as const,
            event_kind: "enrichment_skipped" as const,
            correlation_id: "corr-1",
            org_id: "org-1",
            feature: "draft_enrichment",
            provider_key: "disabled" as const,
            outcome: "disabled" as const,
            redaction: { steps_total: 2, kinds: ["email", "phone"] },
        };
        expect(safeParseAiUsageTelemetryPayloadV1(payload)).not.toBeNull();
        const json = aiUsageTelemetryPayloadV1ToJson(payload);
        expect(json.correlation_id).toBe("corr-1");
    });

    it("rejects invalid payloads", () => {
        expect(safeParseAiUsageTelemetryPayloadV1({ schema_version: 2 })).toBeNull();
    });
});

describe("AiEnrichmentEnvelopeV1 serialization", () => {
    it("serializes envelope for logging fixtures", () => {
        const policy = parseAiPolicyFromMetadata({});
        const json = aiEnrichmentEnvelopeV1ToJson({
            version: 1,
            deterministic_suggestion: minimalSuggestion(),
            enrichment: null,
            policy_snapshot: {
                enabled: policy.enabled,
                provider: policy.provider,
                pii_mode: policy.pii_mode,
                allowed_features: policy.allowed_features,
            },
        });
        expect(json.version).toBe(1);
        expect(json.enrichment).toBeNull();
        expect((json.deterministic_suggestion as { agent_key?: string })?.agent_key).toBe("needs_attention_suggestion");
    });
});
