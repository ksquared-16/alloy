import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/agent/v1/record-overview-layout/route";
import * as supabaseAdmin from "@/lib/supabaseAdmin";

const { mockGetAdminContext } = vi.hoisted(() => ({
    mockGetAdminContext: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContext: mockGetAdminContext,
        getAdminContextCached: mockGetAdminContext,
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(),
}));

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";

const requestId = "a1111111-1111-4111-8111-111111111111";
const correlationId = "b2222222-2222-4222-8222-222222222222";

const validConfig = {
    version: 1,
    header_keys: ["title"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [{ kind: "system_field", key: "title" }],
        },
    ],
};

const baseEnvelope = {
    request_id: requestId,
    correlation_id: correlationId,
    message: "apply layout",
};

function buildRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/admin/agent/v1/record-overview-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/admin/agent/v1/record-overview-layout", () => {
    beforeEach(() => {
        vi.stubEnv("AGENT_V1_RECORD_LAYOUT_ENABLED", "true");
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns FEATURE_DISABLED when flag off", async () => {
        vi.stubEnv("AGENT_V1_RECORD_LAYOUT_ENABLED", "false");
        const res = await POST(
            buildRequest({
                ...baseEnvelope,
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_record_layout",
                    slots: {
                        target_kind: "record_overview_layout",
                        entity_type: "job",
                        surface: "overview",
                        config: validConfig,
                        expected_config_version: 0,
                    },
                },
            })
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error: { error_code: string } };
        expect(j.error.error_code).toBe("FEATURE_DISABLED");
    });

    it("validation failure on bad config shape", async () => {
        const maybeSingle = vi.fn(async () => ({
            data: { id: "11111111-1111-1111-1111-111111111111", config: {} },
            error: null,
        }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle,
                            }),
                        }),
                    }),
                }),
            }),
            rpc: vi.fn(),
        } as never);

        const res = await POST(
            buildRequest({
                ...baseEnvelope,
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_record_layout",
                    slots: {
                        target_kind: "record_overview_layout",
                        entity_type: "job",
                        surface: "overview",
                        config: { version: 1 },
                        expected_config_version: 0,
                    },
                },
            })
        );
        expect(res.status).toBe(400);
    });

    it("succeeds with structured_override and calls atomic RPC with audit-capable payload", async () => {
        const rpc = vi.fn(async () => ({
            data: {
                id: "11111111-1111-1111-1111-111111111111",
                config: validConfig,
                updated_at: "ts",
            },
            error: null,
        }));
        const maybeSingle = vi.fn(async () => ({
            data: { id: "11111111-1111-1111-1111-111111111111", config: {}, updated_at: null },
            error: null,
        }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle,
                            }),
                        }),
                    }),
                }),
            }),
            rpc,
        } as never);

        const res = await POST(
            buildRequest({
                ...baseEnvelope,
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_record_layout",
                    slots: {
                        target_kind: "record_overview_layout",
                        entity_type: "job",
                        surface: "overview",
                        config: validConfig,
                        expected_config_version: 0,
                    },
                },
            })
        );
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith(
            "agent_v1_commit_record_overview_layout_apply",
            expect.objectContaining({
                p_org_id: orgId,
                p_user_id: userId,
                p_entity_type: "jobs",
                p_surface: "overview",
                p_expected_version: 0,
                p_proposal_id: expect.any(String),
                p_result_id: expect.any(String),
                p_intent_json: expect.any(Object),
            })
        );
        const j = (await res.json()) as { ok: boolean; execution: { terminal_status: string } };
        expect(j.ok).toBe(true);
        expect(j.execution.terminal_status).toBe("success");
    });
});
