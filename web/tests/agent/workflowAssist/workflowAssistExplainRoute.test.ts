import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/admin/ai/workflow-assist/explain/route";

const orgId = "11111111-1111-4111-8111-111111111111";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockFetchExplain } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockFetchExplain: vi.fn(),
}));

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return {
        ...actual,
        requireAdminOrOps: () => mockRequireAdminOrOps(),
    };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

vi.mock("@/lib/agent/workflowAssist/workflowAssistExplainService", () => ({
    fetchWorkflowAssistExplainV1: (...args: unknown[]) => mockFetchExplain(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({}),
}));

describe("GET /api/admin/ai/workflow-assist/explain", () => {
    beforeEach(() => {
        mockRequireAdminOrOps.mockReset();
        mockGetAdminContextCached.mockReset();
        mockFetchExplain.mockReset();
        mockRequireAdminOrOps.mockResolvedValue(null);
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId: "22222222-2222-4222-8222-222222222222",
            role: "ops",
        });
    });

    it("returns 400 when entity params missing", async () => {
        const req = new NextRequest("http://localhost/api/admin/ai/workflow-assist/explain");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    it("returns explanation for ops (read-only)", async () => {
        mockFetchExplain.mockResolvedValue({
            version: 1,
            status: "no_event_found",
            confidence: "medium",
            headline: "No workflow event found for this record",
            likely_reason: "test",
            recommended_action: "test",
            checklist: [],
            links: {},
            context: { entity_type: "opportunities", entity_id: "abc" },
        });
        const req = new NextRequest(
            "http://localhost/api/admin/ai/workflow-assist/explain?entity_type=opportunities&entity_id=00000000-0000-4000-8000-000000000001"
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; explanation?: { status?: string } };
        expect(j.ok).toBe(true);
        expect(j.explanation?.status).toBe("no_event_found");
        expect(mockFetchExplain).toHaveBeenCalledTimes(1);
        expect(mockFetchExplain.mock.calls[0]![1]).toBe(orgId);
    });

    it("returns 403 when requireAdminOrOps blocks", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const req = new NextRequest(
            "http://localhost/api/admin/ai/workflow-assist/explain?entity_type=opportunities&entity_id=00000000-0000-4000-8000-000000000001"
        );
        const res = await GET(req);
        expect(res.status).toBe(403);
        expect(mockFetchExplain).not.toHaveBeenCalled();
    });
});
