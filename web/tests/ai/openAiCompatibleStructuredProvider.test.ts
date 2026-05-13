import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
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
        vi.stubEnv("OPENAI_MODEL", "gpt-test");
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
        const res = await provider.completeStructured({
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
});
