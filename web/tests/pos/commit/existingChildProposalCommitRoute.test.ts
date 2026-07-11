import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";
const caseId = "11111111-1111-4111-8111-111111111111";
const proposalId = "rrp:test";

const { mockGetAdminContextCached, mockCreateAdminClient, mockExecute, mockPreview } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockExecute: vi.fn(),
    mockPreview: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));

vi.mock("@/lib/pos/processingCase/commit/executeExistingChildProposalCommit", () => ({
    executeExistingChildProposalCommit: (...args: unknown[]) => mockExecute(...args),
    previewExistingChildProposalCommit: (...args: unknown[]) => mockPreview(...args),
}));

import { POST as postCommit } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route";
import { POST as postPreview } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/preview/route";

const decision = { proposal_id: proposalId, field_decisions: [{ provider_ref: "child.child_first_name", decision: "approve" as const }] };

function supabaseCase(metadata: Record<string, unknown> = {}) {
    return {
        from(table: string) {
            expect(table).toBe("processing_cases");
            return {
                select() {
                    return this;
                },
                eq() {
                    return this;
                },
                maybeSingle: async () => ({ data: { id: caseId, metadata }, error: null }),
                update: vi.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
            };
        },
    };
}

describe("existing child proposal commit routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
        mockCreateAdminClient.mockReturnValue(supabaseCase());
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await postCommit(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ caseId, proposalId }) });
        expect(res.status).toBe(401);
    });

    it("returns 403 from orchestrator for unauthorized child", async () => {
        mockExecute.mockResolvedValue({ ok: false, status: 403, error: "Child record belongs to a different organization" });
        const res = await postCommit(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ caseId, proposalId }) });
        expect(res.status).toBe(403);
    });

    it("returns preview plan without committing", async () => {
        mockPreview.mockResolvedValue({
            ok: true,
            preview: { proposal_id: proposalId, record_id: "cm-1", review_state: "ready_to_commit", can_commit: true, fields: [], approved_changes: [], skipped_changes: [] },
            idempotency_key: "ik1",
            decision_version: "dv1",
        });
        const res = await postPreview(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ caseId, proposalId }) });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.preview.can_commit).toBe(true);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it("returns idempotent alreadyDone commit response", async () => {
        mockExecute.mockResolvedValue({
            ok: true,
            alreadyDone: true,
            preview: { proposal_id: proposalId, record_id: "cm-1", review_state: "fully_committed", can_commit: false, fields: [], approved_changes: [], skipped_changes: [] },
            idempotency_key: "ik1",
            decision_version: "dv1",
            result: { status: "committed", field_results: [], skipped_changes: [] },
            audit_event_id: "evt-1",
        });
        const res = await postCommit(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ caseId, proposalId }) });
        const json = await res.json();
        expect(json.data.alreadyDone).toBe(true);
        expect(json.data.audit_event_id).toBe("evt-1");
    });

    it("rejects tampered proposal id in decision body", async () => {
        const res = await postCommit(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ decision: { ...decision, proposal_id: "other" } }) }), { params: Promise.resolve({ caseId, proposalId }) });
        expect(res.status).toBe(400);
    });
});
