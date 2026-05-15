import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/admin/ai/workflow-assist/propose/route";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { AI_ENRICHMENT_USE_PERMISSION_KEY } from "@/lib/ai/aiEnrichmentPermissions";

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";
const wfId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const { mockRequireAdmin, mockGetAdminContextCached, mockGetAdminAccessContextCached, mockMaybeSingle, fromSpy } =
    vi.hoisted(() => ({
        mockRequireAdmin: vi.fn(),
        mockGetAdminContextCached: vi.fn(),
        mockGetAdminAccessContextCached: vi.fn(),
        mockMaybeSingle: vi.fn(),
        fromSpy: vi.fn(),
    }));

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return {
        ...actual,
        requireAdmin: () => mockRequireAdmin(),
    };
});

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
        from: (...args: unknown[]) => {
            fromSpy(...args);
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: mockMaybeSingle,
                    }),
                }),
            };
        },
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

function postJson(body: unknown) {
    return new NextRequest("http://localhost/api/admin/ai/workflow-assist/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/admin/ai/workflow-assist/propose", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        mockRequireAdmin.mockResolvedValue(null);
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
                        allowed_features: ["workflow_assist_draft"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
        fromSpy.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns 403 when requireAdmin rejects (non-admin)", async () => {
        mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
        const res = await POST(
            postJson({ version: 1, proposal_kind: "pause_workflow", workflow_id: wfId }),
        );
        expect(res.status).toBe(403);
        expect(mockGetAdminContextCached).not.toHaveBeenCalled();
    });

    it("returns 403 when workflow_assist_draft feature missing", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        mockMaybeSingle.mockResolvedValueOnce({
            data: {
                metadata: {
                    [AI_POLICY_METADATA_KEY]: {
                        enabled: true,
                        provider: "stub",
                        allowed_features: ["task_assist_draft"],
                        logging_mode: "minimal",
                    },
                },
            },
            error: null,
        });
        const res = await POST(
            postJson({ version: 1, proposal_kind: "pause_workflow", workflow_id: wfId }),
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("AI_FEATURE_NOT_ALLOWED");
    });

    it("returns 400 for unsupported proposal_kind", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({ version: 1, proposal_kind: "bulk_pause_all", workflow_ids: [] }),
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("UNSUPPORTED_PROPOSAL_KIND");
    });

    it("returns suggestion for valid pause_workflow and does not query workflows table", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
        const res = await POST(
            postJson({ version: 1, proposal_kind: "pause_workflow", workflow_id: wfId }),
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; suggestion?: { proposal_kind?: string; suggestion_id?: string } };
        expect(j.ok).toBe(true);
        expect(j.suggestion?.proposal_kind).toBe("pause_workflow");
        expect(j.suggestion?.suggestion_id).toMatch(/^wa-[0-9a-f]{32}$/);
        const tables = fromSpy.mock.calls.map((c) => c[0]);
        expect(tables).toContain("org_settings");
        expect(tables.every((t) => t !== "workflows")).toBe(true);
    });
});
