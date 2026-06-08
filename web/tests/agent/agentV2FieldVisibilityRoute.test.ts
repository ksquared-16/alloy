import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/agent/v2/field-visibility/route";
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
const fieldId = "f1111111-1111-4111-8111-111111111111";

describe("POST /api/admin/agent/v2/field-visibility", () => {
    beforeEach(() => {
        vi.stubEnv("AGENT_V2_FIELD_VISIBILITY_ENABLED", "true");
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
        vi.stubEnv("AGENT_V2_FIELD_VISIBILITY_ENABLED", "false");
        const res = await POST(
            new NextRequest("http://localhost/api/admin/agent/v2/field-visibility", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: requestId,
                    correlation_id: correlationId,
                    message: "x",
                    structured_override: {
                        intent_id: "c1111111-1111-4111-8111-111111111111",
                        intent_version: 1,
                        intent_type: "update_field_visibility",
                        slots: {
                            target_kind: "field_definition_visibility",
                            field_definition_id: fieldId,
                            expected_updated_at: "2026-01-15T12:00:00.000Z",
                            visibility_patch: { version: 1, is_visible_in_table: true },
                        },
                    },
                }),
            })
        );
        expect(res.status).toBe(403);
    });

    it("calls RPC on success path", async () => {
        const rpc = vi.fn(async () => ({
            data: {
                id: fieldId,
                updated_at: "new",
                is_visible_in_table: true,
            },
            error: null,
        }));
        const maybeSingle = vi.fn(async () => ({
            data: {
                id: fieldId,
                org_id: orgId,
                is_visible_in_form: true,
                is_visible_in_drawer: true,
                is_visible_in_table: false,
                is_visible_in_public_booking: false,
                updated_at: "2026-01-15T12:00:00.000Z",
            },
            error: null,
        }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle,
                        }),
                    }),
                }),
            }),
            rpc,
        } as never);

        const res = await POST(
            new NextRequest("http://localhost/api/admin/agent/v2/field-visibility", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: requestId,
                    correlation_id: correlationId,
                    message: "apply",
                    structured_override: {
                        intent_id: "c1111111-1111-4111-8111-111111111111",
                        intent_version: 1,
                        intent_type: "update_field_visibility",
                        slots: {
                            target_kind: "field_definition_visibility",
                            field_definition_id: fieldId,
                            expected_updated_at: "2026-01-15T12:00:00.000Z",
                            visibility_patch: { version: 1, is_visible_in_table: true },
                        },
                    },
                }),
            })
        );
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith(
            "agent_v2_commit_field_visibility_apply",
            expect.objectContaining({
                p_org_id: orgId,
                p_field_definition_id: fieldId,
            })
        );
    });
});
