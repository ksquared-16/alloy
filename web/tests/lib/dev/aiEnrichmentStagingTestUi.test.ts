import { describe, expect, it } from "vitest";

import { summarizeEnrichAttentionTestResponse } from "@/lib/dev/aiEnrichmentStagingTestUi";

describe("summarizeEnrichAttentionTestResponse", () => {
    it("maps ok response with telemetry and schema_ok", () => {
        const json = {
            ok: true,
            enrichment_telemetry: { provider_key: "stub", outcome: "stub_success" },
            provider_error_code: null,
            envelope: {
                enrichment: {
                    version: 1,
                    agent_key: "needs_attention_suggestion_enrichment",
                    reasoning_summary_overlay: "x",
                    generated_at_iso: "2026-05-13T12:00:00.000Z",
                    provider_report: { provider_key: "stub", execution_mode: "stub" },
                },
            },
        };
        const s = summarizeEnrichAttentionTestResponse(200, json);
        expect(s.status).toBe(200);
        expect(s.provider_key).toBe("stub");
        expect(s.outcome).toBe("stub_success");
        expect(s.has_enrichment).toBe(true);
        expect(s.schema_ok).toBe(true);
        expect(s.error_code).toBeNull();
    });

    it("maps error JSON body", () => {
        const s = summarizeEnrichAttentionTestResponse(403, { ok: false, error: "FEATURE_DISABLED" });
        expect(s.status).toBe(403);
        expect(s.error_code).toBe("FEATURE_DISABLED");
        expect(s.has_enrichment).toBe(false);
    });

    it("reports schema_ok false when enrichment invalid", () => {
        const json = {
            ok: true,
            enrichment_telemetry: { provider_key: "stub", outcome: "stub_success" },
            provider_error_code: null,
            envelope: { enrichment: { version: 1, bad: true } },
        };
        const s = summarizeEnrichAttentionTestResponse(200, json);
        expect(s.has_enrichment).toBe(true);
        expect(s.schema_ok).toBe(false);
    });
});
