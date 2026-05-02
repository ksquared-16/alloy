import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/agent/v0/queue-definition/route";
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

const validSlots = {
    work_unit_id: "11111111-1111-1111-1111-111111111111",
    queue_definition: {
        version: 1,
        entity_type: "job",
        sort: { by: "updated_at", direction: "desc" },
        limit: 10,
    },
    expected_queue_definition_version: 0,
};

function buildRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/admin/agent/v0/queue-definition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/admin/agent/v0/queue-definition", () => {
    beforeEach(() => {
        vi.stubEnv("AGENT_V0_ENABLED", "true");
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: "22222222-2222-2222-2222-222222222222",
            userId: "33333333-3333-3333-3333-333333333333",
            role: "admin",
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns FEATURE_DISABLED when flag off", async () => {
        vi.stubEnv("AGENT_V0_ENABLED", "false");
        const res = await POST(
            buildRequest({
                request_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                correlation_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                message: "test",
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_queue_definition",
                    slots: validSlots,
                },
            })
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error: { error_code: string } };
        expect(j.error.error_code).toBe("FEATURE_DISABLED");
    });

    it("succeeds with structured_override and calls atomic RPC", async () => {
        const rpc = vi.fn(async () => ({
            data: {
                id: validSlots.work_unit_id,
                queue_definition: validSlots.queue_definition,
                updated_at: "new",
            },
            error: null,
        }));
        const mockFrom = vi.fn((table: string) => {
            if (table === "work_units") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        id: validSlots.work_unit_id,
                                        org_id: "22222222-2222-2222-2222-222222222222",
                                        queue_definition: {},
                                        updated_at: "old",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({ from: mockFrom, rpc } as never);

        const res = await POST(
            buildRequest({
                request_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                correlation_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                message: "test",
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_queue_definition",
                    slots: validSlots,
                },
            })
        );

        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok: boolean; execution: { terminal_status: string } };
        expect(j.ok).toBe(true);
        expect(j.execution.terminal_status).toBe("success");
        expect(rpc).toHaveBeenCalledWith("agent_v0_commit_queue_definition_apply", expect.any(Object));
    });

    it("returns validation error when queue_definition invalid", async () => {
        const rpc = vi.fn();
        const mockFrom = vi.fn((table: string) => {
            if (table === "work_units") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        id: validSlots.work_unit_id,
                                        org_id: "22222222-2222-2222-2222-222222222222",
                                        queue_definition: {},
                                        updated_at: "old",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({ from: mockFrom, rpc } as never);

        const badSlots = {
            ...validSlots,
            queue_definition: { version: 1, entity_type: "job", extra: 1 },
        };

        const res = await POST(
            buildRequest({
                request_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                correlation_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                message: "test",
                structured_override: {
                    intent_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    intent_version: 1,
                    intent_type: "update_queue_definition",
                    slots: badSlots,
                },
            })
        );

        expect(res.status).toBe(400);
        const j = (await res.json()) as { ok: boolean; error: { error_code: string } };
        expect(j.ok).toBe(false);
        expect(j.error.error_code).toBe("VALIDATION_FAILED");
        expect(rpc).not.toHaveBeenCalled();
    });
});
