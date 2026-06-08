import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE } from "@/lib/ai/enrichAttentionSuggestionStub";
import { createOpenAiCompatibleStructuredProvider } from "@/lib/ai/openAiCompatibleStructuredProvider";

const validModelJson = {
    version: 1,
    agent_key: "needs_attention_suggestion_enrichment",
    reasoning_summary_overlay: "Structured overlay",
    generated_at_iso: "2026-05-13T12:00:00.000Z",
    provider_report: { provider_key: "openai", execution_mode: "live" },
};

function completionResponseJson(contentObj: unknown) {
    return {
        choices: [{ message: { content: JSON.stringify(contentObj) } }],
    };
}

describe("createOpenAiCompatibleStructuredProvider", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("POSTs JSON mode completion and returns Zod-validated enrichment", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(completionResponseJson(validModelJson)), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: {
                enabled: true,
                provider: "openai",
                allowed_features: ["draft_enrichment"],
                logging_mode: "minimal",
            },
        });
        const provider = createOpenAiCompatibleStructuredProvider(policy);
        const res = await provider.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "org-x",
            payload: { next_action_key: "k", primary_reason_code: "r" },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });

        expect(res.outcome).toBe("ok");
        expect(res.data?.reasoning_summary_overlay).toBe("Structured overlay");
        expect(res.provider_key).toBe("openai");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0]!;
        expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test-key" });
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.response_format).toEqual({ type: "json_object" });
        expect(body.messages[0].role).toBe("system");
        expect(body.temperature).toBe(0.2);
    });

    it("returns error when model JSON fails schema", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(completionResponseJson({ version: 1, bad: true })), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: { enabled: true, provider: "openai", allowed_features: ["draft_enrichment"] },
        });
        const provider = createOpenAiCompatibleStructuredProvider(policy);
        const res = await provider.completeStructured({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "org-x",
            payload: {},
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("error");
        expect(res.error?.code).toBe("OPENAI_SCHEMA_REJECTED");
    });

    it("maps non-2xx JSON error body into safe provider error (no raw body)", async () => {
        const errJson = {
            error: {
                message: "Incorrect API key provided",
                type: "invalid_request_error",
                param: null,
                code: "invalid_api_key",
            },
        };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(errJson), { status: 401, headers: { "Content-Type": "application/json" } }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: { enabled: true, provider: "openai", allowed_features: ["draft_enrichment"] },
        });
        const provider = createOpenAiCompatibleStructuredProvider(policy);
        const res = await provider.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "org-x",
            payload: {},
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("error");
        expect(res.error?.code).toBe("OPENAI_HTTP_401_INVALID_API_KEY");
        expect(res.error?.openai_http?.http_status).toBe(401);
        expect(res.error?.openai_http?.openai_error_code).toBe("invalid_api_key");
        expect(res.error?.message).toMatch(/401/);
        expect(res.error?.detail).toBeUndefined();
        expect(JSON.stringify(res.error)).not.toContain("sk-");
    });

    it("omits temperature for gpt-5-mini (default-temperature-only models)", async () => {
        vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(completionResponseJson(validModelJson)), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: { enabled: true, provider: "openai", allowed_features: ["draft_enrichment"] },
        });
        const provider = createOpenAiCompatibleStructuredProvider(policy);
        await provider.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "org-x",
            payload: { next_action_key: "k", primary_reason_code: "r" },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        const [, init] = fetchMock.mock.calls[0]!;
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).not.toHaveProperty("temperature");
    });

    it("includes OPENAI_CHAT_TEMPERATURE when model supports custom temperature", async () => {
        vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
        vi.stubEnv("OPENAI_CHAT_TEMPERATURE", "0.65");
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(completionResponseJson(validModelJson)), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const policy = parseAiPolicyFromMetadata({
            [AI_POLICY_METADATA_KEY]: { enabled: true, provider: "openai", allowed_features: ["draft_enrichment"] },
        });
        const provider = createOpenAiCompatibleStructuredProvider(policy);
        await provider.completeStructured<AttentionSuggestionAiEnrichmentV1>({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
            org_id: "org-x",
            payload: { next_action_key: "k", primary_reason_code: "r" },
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        const [, init] = fetchMock.mock.calls[0]!;
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.temperature).toBe(0.65);
    });
});
