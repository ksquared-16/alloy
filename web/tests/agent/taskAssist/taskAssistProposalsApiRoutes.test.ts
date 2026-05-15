import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { GET as getProposals, POST as postProposals } from "@/app/api/admin/ai/task-assist/proposals/route";
import { POST as postApprove } from "@/app/api/admin/ai/task-assist/proposals/[id]/approve/route";
import { POST as postReject } from "@/app/api/admin/ai/task-assist/proposals/[id]/reject/route";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const proposalId = "55555555-5555-4555-8555-555555555555";

const { mockGetAdminContextCached, mockList, mockCreate, mockApprove, mockReject, mockAssertRowOrg } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockList: vi.fn(),
    mockCreate: vi.fn(),
    mockApprove: vi.fn(),
    mockReject: vi.fn(),
    mockAssertRowOrg: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: vi.fn(() => Promise.resolve(null)) };
});

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: (...args: unknown[]) => mockAssertRowOrg(...args),
}));

vi.mock("@/lib/agent/taskAssist/taskAssistProposalPersistence", () => ({
    createTaskAssistProposal: (...args: unknown[]) => mockCreate(...args),
    listTaskAssistProposalsForEntity: (...args: unknown[]) => mockList(...args),
    approveTaskAssistProposal: (...args: unknown[]) => mockApprove(...args),
    rejectTaskAssistProposal: (...args: unknown[]) => mockReject(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

describe("task-assist proposals admin routes", () => {
    beforeEach(() => {
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
        mockAssertRowOrg.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("GET lists proposals for opportunity", async () => {
        mockList.mockResolvedValue({ ok: true, rows: [{ id: proposalId, status: "draft" }] });
        const req = new NextRequest(
            `http://localhost/api/admin/ai/task-assist/proposals?entity_type=opportunities&entity_id=${oppId}`,
        );
        const res = await getProposals(req);
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; proposals?: unknown[] };
        expect(j.ok).toBe(true);
        expect(j.proposals).toHaveLength(1);
        expect(mockList).toHaveBeenCalledWith(
            expect.objectContaining({ orgId, entityType: "opportunities", entityId: oppId }),
        );
    });

    it("POST creates proposal", async () => {
        mockCreate.mockResolvedValue({ ok: true, row: { id: proposalId, status: "draft" } });
        const req = new NextRequest("http://localhost/api/admin/ai/task-assist/proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                expires_at: null,
                payload: {
                    version: 1,
                    agent_key: "task_assist",
                    suggestion_id: "b".repeat(48),
                    generated_at_iso: "2026-05-14T00:00:00.000Z",
                    org_id: orgId,
                    actor_user_id: userId,
                    source_surface: "opportunity_drawer",
                    task_type: "draft_sms",
                    entity_type: "opportunities",
                    entity_id: oppId,
                    context_summary: "c",
                    recipient_candidates: [
                        { person_id: "44444444-4444-4444-8444-444444444444", display_label: "P", has_sms: true, has_email: true },
                    ],
                    selected_recipient: null,
                    channel: "sms",
                    draft_subject: null,
                    draft_body: "x",
                    scheduled_for_iso: null,
                    reminder_due_at_iso: null,
                    assumptions: [],
                    missing_inputs: [],
                    warnings: [],
                    validation_errors: [],
                    confidence: { mode: "deterministic" },
                    approval_required: true,
                    apply_intent: { kind: "none" },
                },
            }),
        });
        const res = await postProposals(req);
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("POST approve delegates to service", async () => {
        mockApprove.mockResolvedValue({ ok: true, row: { id: proposalId, status: "approved" } });
        const req = new NextRequest(`http://localhost/api/admin/ai/task-assist/proposals/${proposalId}/approve`, {
            method: "POST",
        });
        const res = await postApprove(req, { params: Promise.resolve({ id: proposalId }) });
        expect(res.status).toBe(200);
        expect(mockApprove).toHaveBeenCalledOnce();
    });

    it("POST reject delegates to service", async () => {
        mockReject.mockResolvedValue({ ok: true, row: { id: proposalId, status: "rejected" } });
        const req = new NextRequest(`http://localhost/api/admin/ai/task-assist/proposals/${proposalId}/reject`, {
            method: "POST",
        });
        const res = await postReject(req, { params: Promise.resolve({ id: proposalId }) });
        expect(res.status).toBe(200);
        expect(mockReject).toHaveBeenCalledOnce();
    });
});
