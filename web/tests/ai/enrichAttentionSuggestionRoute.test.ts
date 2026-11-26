import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/ai/enrich-attention-suggestion/route";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import {
    parseEnrichAttentionSuggestionRequest,
    parseDeterministicAttentionSuggestionForEnrichRoute,
} from "@/lib/ai/enrichAttentionSuggestionRouteValidation";
import { AI_ENRICHMENT_USE_PERMISSION_KEY } from "@/lib/ai/aiEnrichmentPermissions";
import * as supabaseAdmin from "@/lib/supabaseAdmin";

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";

const { mockGetAdminContextCached, mockGetAdminAccessContextCached, mockMaybeSingle, mockTrustInsert } = vi.hoisted(
    () => ({
        mockGetAdminContextCached: vi.fn(),
        mockGetAdminAccessContextCached: vi.fn(),
        mockMaybeSingle: vi.fn(),
        /** Records Trust Runtime persistence so the route's writes are visible to assertions. */
        mockTrustInsert: vi.fn(),
    }),
);

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return {
        ...actual,
        getAdminAccessContextCached: mockGetAdminAccessContextCached,
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: mockMaybeSingle,
                }),
            }),
            // The route now writes Trust Runtime rows on the deterministic path.
            insert: (row: unknown) => {
                mockTrustInsert(table, row);
                return {
                    select: () => ({ single: async () => ({ data: { id: "event-1" }, error: null }) }),
                    then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
                };
            },
            update: () => ({
                eq: () => ({
                    eq: async () => ({ error: null }),
                }),
            }),
        }),
    })),
}));

function baseAccess(permissionKeys: string[]) {
    return {
        ok: true as const,
        userId,
        orgId,
        roleKeys: ["admin"],
        permissionKeys,
        departmentScope: "all" as const,
        allowedDepartmentIds: null,
        siteScope: "all" as const,
        allowedSiteLocationIds: null,
    };
}

function minimalDeterministicSuggestion() {
    return {
        version: 1,
        agent_key: "needs_attention_suggestion",
        suggestion_id: "a".repeat(48),
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
        reasoning: { summary: "Stale inquiry.", factors: [] },
        suggested_content: {
            channel: "email",
            template_key: "generic_follow_up_short",
            body: "SECRET_DRAFT_BODY_XYZ",
            variables: {},
        },
        generated_at_iso: "2026-05-13T12:00:00.000Z",
    };
}

function postJson(body: unknown) {
    return new NextRequest("http://localhost/api/admin/ai/enrich-attention-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("parseEnrichAttentionSuggestionRequest (route validation helper)", () => {
    it("accepts a valid body", () => {
        const det = minimalDeterministicSuggestion();
        const r = parseEnrichAttentionSuggestionRequest({
            correlation_id: "c1",
            deterministic_suggestion: det,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.deterministic.agent_key).toBe("needs_attention_suggestion");
    });

    it("rejects invalid suggestion", () => {
        const r = parseEnrichAttentionSuggestionRequest({
            correlation_id: "c1",
            deterministic_suggestion: { version: 99 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_SUGGESTION");
    });

    it("parseDeterministicAttentionSuggestionForEnrichRoute rejects wrong entity", () => {
        const bad = { ...minimalDeterministicSuggestion(), target: { entity_type: "persons", entity_id: "x" } };
        expect(parseDeterministicAttentionSuggestionForEnrichRoute(bad)).toBeNull();
    });
});

describe("POST /api/admin/ai/enrich-attention-suggestion", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
        mockGetAdminAccessContextCached.mockResolvedValue(baseAccess([AI_ENRICHMENT_USE_PERMISSION_KEY]));
        mockMaybeSingle.mockResolvedValue({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "stub",
                        allowed_features: ["draft_enrichment"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("returns 403 when portal denies (permission / strict gate)", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        mockGetAdminAccessContextCached.mockResolvedValue(baseAccess([]));
        const res = await POST(
            postJson({
                correlation_id: "corr-p",
                deterministic_suggestion: minimalDeterministicSuggestion(),
            }),
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("AI_ENRICHMENT_FORBIDDEN");
    });

    it("returns 403 when org policy denies draft enrichment", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        mockMaybeSingle.mockResolvedValue({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "stub",
                        allowed_features: [],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
        const res = await POST(
            postJson({
                correlation_id: "corr-pol",
                deterministic_suggestion: minimalDeterministicSuggestion(),
            }),
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });

    it("returns 403 FEATURE_DISABLED when stub provider path but global stub env is off", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        const res = await POST(
            postJson({
                correlation_id: "corr-off",
                deterministic_suggestion: minimalDeterministicSuggestion(),
            }),
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("FEATURE_DISABLED");
    });

    it("stub path returns structured enrichment when gates pass", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        vi.stubEnv("AI_ENRICHMENT_TELEMETRY_ENABLED", "false");
        const res = await POST(
            postJson({
                correlation_id: "corr-stub-ok",
                deterministic_suggestion: minimalDeterministicSuggestion(),
            }),
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            envelope?: { enrichment?: unknown };
            enrichment_telemetry?: { provider_key?: string; outcome?: string };
            provider_error_code?: string | null;
        };
        expect(j.enrichment_telemetry?.provider_key).toBe("stub");
        expect(j.enrichment_telemetry?.outcome).toBe("stub_success");
        expect(j.provider_error_code ?? null).toBeNull();
        const parsed = safeParseAttentionSuggestionAiEnrichmentV1(j.envelope?.enrichment ?? null);
        expect(parsed).not.toBeNull();
        expect(parsed?.provider_report.execution_mode).toBe("stub");
    });

    it("OpenAI path: mocked fetch returns JSON; response enrichment passes Zod; no API key in body", async () => {
        const secretKey = "sk-vercel-test-secret-do-not-leak-999";
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("OPENAI_API_KEY", secretKey);
        vi.stubEnv("OPENAI_MODEL", "gpt-test-model");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        vi.stubEnv("AI_ENRICHMENT_TELEMETRY_ENABLED", "false");

        mockMaybeSingle.mockResolvedValue({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "openai",
                        allowed_features: ["draft_enrichment"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });

        const enrichmentJson = {
            version: 1,
            agent_key: "needs_attention_suggestion_enrichment",
            reasoning_summary_overlay: "Live summary line",
            generated_at_iso: "2026-05-13T12:00:00.000Z",
            provider_report: { provider_key: "openai", execution_mode: "live" },
        };

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    choices: [{ message: { content: JSON.stringify(enrichmentJson) } }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await POST(
            postJson({
                correlation_id: "corr-live",
                deterministic_suggestion: minimalDeterministicSuggestion(),
            }),
        );
        expect(res.status).toBe(200);
        const rawText = await res.text();
        expect(rawText).not.toContain(secretKey);

        for (const spy of [logSpy, warnSpy, errSpy]) {
            expect(JSON.stringify(spy.mock.calls)).not.toContain(secretKey);
        }
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errSpy.mockRestore();

        const fetchBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
        const userMsg = fetchBody.messages.find((m: { role?: string }) => m.role === "user");
        expect(JSON.stringify(userMsg)).not.toContain("SECRET_DRAFT_BODY_XYZ");

        const j = JSON.parse(rawText) as {
            ok?: boolean;
            envelope?: { enrichment?: unknown };
            telemetry_emitted?: boolean;
            enrichment_telemetry?: { provider_key?: string; outcome?: string };
        };
        expect(j.ok).toBe(true);
        expect(j.telemetry_emitted).toBe(false);
        expect(j.enrichment_telemetry?.provider_key).toBe("openai");
        expect(j.enrichment_telemetry?.outcome).toBe("live_success");
        const parsed = safeParseAttentionSuggestionAiEnrichmentV1(j.envelope?.enrichment ?? null);
        expect(parsed).not.toBeNull();
        expect(parsed?.provider_report.provider_key).toBe("openai");
    });
});
