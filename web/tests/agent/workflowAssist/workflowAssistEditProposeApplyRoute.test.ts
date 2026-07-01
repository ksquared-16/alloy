import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as POST_APPLY } from "@/app/api/admin/ai/workflow-assist/apply/route";
import { POST as POST_PROPOSE } from "@/app/api/admin/ai/workflow-assist/propose/route";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import { AI_ENRICHMENT_USE_PERMISSION_KEY } from "@/lib/ai/aiEnrichmentPermissions";

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";
const wfId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const { mockRequireAdmin, mockGetAdminContextCached, mockGetAdminAccessContextCached, mockCreateAdminClient } = vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockGetAdminAccessContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
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
    createAdminClient: () => mockCreateAdminClient(),
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

const orgSettingsChain = {
    select: () => ({
        eq: () => ({
            maybeSingle: async () => ({
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
            }),
        }),
    }),
};

function workflowsChainForEdit() {
    return {
        select: () => ({
            eq: (c1: string, v1: string) => ({
                eq: (c2: string, v2: string) => ({
                    maybeSingle: async () => {
                        expect(c1).toBe("id");
                        expect(v1).toBe(wfId);
                        expect(c2).toBe("org_id");
                        expect(v2).toBe(orgId);
                        return { data: { id: wfId }, error: null };
                    },
                }),
            }),
        }),
        update: (updates: Record<string, unknown>) => ({
            eq: (c1: string, v1: string) => ({
                eq: (c2: string, v2: string) => ({
                    select: () => ({
                        single: async () => {
                            expect(Object.keys(updates)).toEqual(["name"]);
                            expect(updates.name).toBe("Renamed via Assist");
                            expect(c1).toBe("id");
                            expect(v1).toBe(wfId);
                            expect(c2).toBe("org_id");
                            expect(v2).toBe(orgId);
                            return {
                                data: { id: wfId, name: "Renamed via Assist", org_id: orgId },
                                error: null,
                            };
                        },
                    }),
                }),
            }),
        }),
    };
}

describe("Workflow Assist edit_workflow propose → apply (integration)", () => {
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
        mockCreateAdminClient.mockImplementation(() => ({
            from: (table: string) => {
                if (table === "org_settings") return orgSettingsChain;
                if (table === "workflows") return workflowsChainForEdit();
                throw new Error(`unexpected table ${table}`);
            },
        }));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("proposes then applies edit with org-scoped update and allowed fields only", async () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");

        const proposeReq = new NextRequest("http://localhost/api/admin/ai/workflow-assist/propose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                version: 1,
                proposal_kind: "edit_workflow",
                workflow_id: wfId,
                patch: { name: "Renamed via Assist" },
            }),
        });
        const proposeRes = await POST_PROPOSE(proposeReq);
        expect(proposeRes.status).toBe(200);
        const proposeJson = (await proposeRes.json()) as {
            ok?: boolean;
            suggestion?: { suggestion_id: string; proposal_kind: string; patch?: { name?: string } };
        };
        expect(proposeJson.ok).toBe(true);
        expect(proposeJson.suggestion?.proposal_kind).toBe("edit_workflow");
        expect(proposeJson.suggestion?.patch?.name).toBe("Renamed via Assist");

        const suggestion = proposeJson.suggestion;
        if (!suggestion) throw new Error("missing suggestion");

        const applyReq = new NextRequest("http://localhost/api/admin/ai/workflow-assist/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                version: 1,
                suggestion_id: suggestion.suggestion_id,
                proposal: suggestion,
                confirm: true,
            }),
        });
        const applyRes = await POST_APPLY(applyReq);
        expect(applyRes.status).toBe(200);
        const applyJson = (await applyRes.json()) as { ok?: boolean; workflow_id?: string; workflow?: { name?: string } };
        expect(applyJson.ok).toBe(true);
        expect(applyJson.workflow_id).toBe(wfId);
        expect(applyJson.workflow?.name).toBe("Renamed via Assist");
    });
});
