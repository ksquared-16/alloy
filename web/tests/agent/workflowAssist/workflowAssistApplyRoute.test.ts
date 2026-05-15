import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/admin/ai/workflow-assist/apply/route";
import { buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const wfId = "33333333-3333-4333-8333-333333333333";

const { mockRequireAdmin, mockGetAdminContextCached, mockExecuteWorkflowAssistApply } = vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockExecuteWorkflowAssistApply: vi.fn(),
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

vi.mock("@/lib/agent/workflowAssist/workflowAssistApplyFromSuggestion", () => ({
    executeWorkflowAssistApply: (...args: unknown[]) => mockExecuteWorkflowAssistApply(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

function postJson(body: unknown) {
    return new NextRequest("http://localhost/api/admin/ai/workflow-assist/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function validPauseSuggestion() {
    return buildWorkflowAssistSuggestionV1({
        orgId,
        actorUserId: userId,
        parsed: { version: 1, proposal_kind: "pause_workflow", workflow_id: wfId, reason: null },
    });
}

describe("POST /api/admin/ai/workflow-assist/apply", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        mockRequireAdmin.mockResolvedValue(null);
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            role: "admin",
        });
        mockExecuteWorkflowAssistApply.mockResolvedValue({
            ok: true,
            workflow_id: wfId,
            workflow: { id: wfId, enabled: false },
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns 403 when requireAdmin rejects (ops / non-admin)", async () => {
        mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
        const suggestion = validPauseSuggestion();
        const res = await POST(
            postJson({
                version: 1,
                suggestion_id: suggestion.suggestion_id,
                proposal: suggestion,
                confirm: true,
            }),
        );
        expect(res.status).toBe(403);
        expect(mockExecuteWorkflowAssistApply).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid proposal shape", async () => {
        const res = await POST(
            postJson({
                version: 1,
                suggestion_id: "x",
                proposal: { version: 1 },
                confirm: true,
            }),
        );
        expect(res.status).toBe(400);
        expect(mockExecuteWorkflowAssistApply).not.toHaveBeenCalled();
    });

    it("delegates to executeWorkflowAssistApply on valid body", async () => {
        const suggestion = validPauseSuggestion();
        const res = await POST(
            postJson({
                version: 1,
                suggestion_id: suggestion.suggestion_id,
                proposal: suggestion,
                confirm: true,
            }),
        );
        expect(res.status).toBe(200);
        expect(mockExecuteWorkflowAssistApply).toHaveBeenCalledTimes(1);
        const arg = mockExecuteWorkflowAssistApply.mock.calls[0]![0] as { proposal: { suggestion_id: string } };
        expect(arg.proposal.suggestion_id).toBe(suggestion.suggestion_id);
    });
});
