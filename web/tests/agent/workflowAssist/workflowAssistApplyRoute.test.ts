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
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            permissionKeys: ["ops.workflows.write"],
            roleKeys: ["admin"],
        });
        mockExecuteWorkflowAssistApply.mockReset();
        mockExecuteWorkflowAssistApply.mockResolvedValue({
            ok: true,
            workflow_id: wfId,
            workflow: { id: wfId, enabled: false },
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    /*
     * THE GRANT DECIDES, NOT THE TITLE.
     *
     * This asserted that `requireAdmin` refusing produced a 403, which tested
     * the role title rather than the authority. The route now requires
     * `ops.workflows.write` — the key that owns the `workflows` and
     * `workflow_actions` tables this writes — so the honest cases are: a
     * principal without it is refused however they are titled, and a principal
     * with it is admitted however they are titled.
     */
    it("refuses a principal who does not hold ops.workflows.write", async () => {
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            permissionKeys: ["ai.enrichment.use", "fields.manage", "layouts.manage"],
            roleKeys: ["admin"],
        });
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
        expect(await res.json()).toMatchObject({ required_permission: "ops.workflows.write" });
        // The mutation must not have happened, not merely been reported refused.
        expect(mockExecuteWorkflowAssistApply).not.toHaveBeenCalled();
    });

    it("admits a custom role that holds ops.workflows.write and is not an admin", async () => {
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            permissionKeys: ["ops.workflows.write"],
            roleKeys: ["workflow_writer"],
        });
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
        expect(mockExecuteWorkflowAssistApply).toHaveBeenCalled();
    });

    it("does not require AI authority to commit an already-generated proposal", async () => {
        // The route invokes no model; it commits a proposal from the body. A
        // Workflow Writer must not also need `ai.enrichment.use`.
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            orgId,
            userId,
            permissionKeys: ["ops.workflows.write"],
            roleKeys: ["workflow_writer"],
        });
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

    it("delegates edit_workflow to executeWorkflowAssistApply", async () => {
        mockExecuteWorkflowAssistApply.mockResolvedValue({
            ok: true,
            workflow_id: wfId,
            workflow: { id: wfId, name: "Renamed via Assist" },
        });
        const suggestion = buildWorkflowAssistSuggestionV1({
            orgId,
            actorUserId: userId,
            parsed: {
                version: 1,
                proposal_kind: "edit_workflow",
                workflow_id: wfId,
                patch: { name: "Renamed via Assist" },
            },
        });
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
        const arg = mockExecuteWorkflowAssistApply.mock.calls[0]![0] as {
            proposal: { proposal_kind: string; patch?: { name?: string } };
        };
        expect(arg.proposal.proposal_kind).toBe("edit_workflow");
        expect(arg.proposal.patch?.name).toBe("Renamed via Assist");
    });

    it("delegates to executeWorkflowAssistApply on valid pause body", async () => {
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

/*
 * THE ACCESS CONTEXT IS NOW PART OF THE GATE.
 *
 * This route admitted on the role TITLE and needed only the admin context. It
 * now resolves the caller's granted capabilities, so a suite that mocks only
 * the admin context gets a 401 from the unmocked access lookup — which reads
 * as "the route broke" when it means "the test has not said what this
 * principal may do". Saying so explicitly is the point: the capability is the
 * authority, so every case must declare it.
 */
const { mockGetAdminAccessContext } = vi.hoisted(() => ({
    mockGetAdminAccessContext: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return {
        ...actual,
        getAdminAccessContext: mockGetAdminAccessContext,
        getAdminAccessContextCached: mockGetAdminAccessContext,
    };
});
