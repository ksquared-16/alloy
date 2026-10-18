/**
 * The commit and reject routes around a family's new-child request: operator-only, claimed once,
 * released when no child was made, settled when one was, and a rejection is final.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
    ctx: vi.fn(),
    context: null as unknown,
    execute: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
    settle: vi.fn(),
    reject: vi.fn(),
    metadata: {} as Record<string, unknown>,
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: m.ctx };
});
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from: () => {
            const api: Record<string, unknown> = {
                select: () => api,
                eq: () => api,
                maybeSingle: async () => ({ data: { id: "c", metadata: m.metadata }, error: null }),
            };
            return api;
        },
    }),
}));
vi.mock("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase", () => ({
    loadRelatedRecordProposalForCase: async () => m.context,
    proposalNotFound: async () => new Response(JSON.stringify({ error: "Proposal not found for case", code: "proposal_not_found" }), { status: 404 }),
}));
vi.mock("@/lib/pos/processingCase/commit/executeNewChildProposalCommit", () => ({
    executeNewChildProposalCommit: (...a: unknown[]) => m.execute(...a),
}));
vi.mock("@/lib/pos/processingCase/commit/participantChildRequestCommit", async (orig) => {
    const real = await orig<typeof import("@/lib/pos/processingCase/commit/participantChildRequestCommit")>();
    return {
        ...real,
        claimParticipantChildRequestForCommit: (...a: unknown[]) => m.claim(...a),
        releaseParticipantChildRequestClaim: (...a: unknown[]) => m.release(...a),
        settleParticipantChildRequestAfterCommit: (...a: unknown[]) => m.settle(...a),
        rejectNewChildProposal: (...a: unknown[]) => m.reject(...a),
    };
});

import { POST as commit } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route";
import { POST as reject } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/reject/route";

const CASE = "11111111-1111-4111-8111-111111111111";
const PID = "rrp:participant_child_request:req-1:children:req-1";
const request = { id: "req-1", customer_id: "house-1", opportunity_id: "opp-1", status: "pending" };
const call = (route: typeof commit, body: unknown) =>
    route(new NextRequest("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ caseId: CASE, proposalId: PID }) });
const commitBody = { decision: { proposal_id: PID, field_decisions: [] }, new_child: { first_name: "Dexter" } };

beforeEach(() => {
    vi.clearAllMocks();
    m.metadata = {};
    m.ctx.mockResolvedValue({ ok: true, orgId: "org", userId: "op-1", role: "admin", permissionKeys: ["processing.operate"] });
    m.context = {
        proposal: { proposal_id: PID, origin: "proposed_new_record", collection_provider_ref: "children", item_entity_type: "customer_member", status: "valid" },
        expectedCustomerId: "house-1",
        source: { source_kind: "participant_child_request", source_id: "req-1" },
        participantChildRequest: request,
    };
    m.claim.mockResolvedValue({ ok: true });
    m.execute.mockResolvedValue({ ok: true, alreadyDone: false, result: { record_id: "cm-new" }, identity_outcome: "created_new", audit_event_id: "evt" });
    m.settle.mockResolvedValue({ requestStatus: "committed", enrollmentRequest: { outcome: "requested", created: true } });
    m.reject.mockResolvedValue({ ok: true, alreadyDone: false });
});

describe("commit", () => {
    it("operator-only: without processing.operate nothing runs", async () => {
        m.ctx.mockResolvedValue({ ok: true, orgId: "org", userId: "u", role: "staff", permissionKeys: [] });
        expect((await call(commit, commitBody)).status).toBe(403);
        expect(m.claim).not.toHaveBeenCalled();
        expect(m.execute).not.toHaveBeenCalled();
    });

    it("claims, commits with the operator's correction, then settles the request with the one child", async () => {
        const res = await call(commit, commitBody);
        expect(res.status).toBe(200);
        expect(m.execute.mock.calls[0]![0]).toMatchObject({ caseId: CASE, proposalId: PID, choice: { firstName: "Dexter" } });
        expect(m.settle.mock.calls[0]![1]).toMatchObject({ caseId: CASE, request, customerMemberId: "cm-new" });
        expect((await res.json()).data.participant_child_request).toEqual({ requestStatus: "committed", enrollmentRequest: { outcome: "requested", created: true } });
        expect(m.release).not.toHaveBeenCalled();
    });

    it("a concurrent commit is refused before it can reach the child writer", async () => {
        m.claim.mockResolvedValue({ ok: false, status: 409, code: "in_progress", error: "busy" });
        expect((await call(commit, commitBody)).status).toBe(409);
        expect(m.execute).not.toHaveBeenCalled();
    });

    it("a duplicate-candidate answer releases the claim and returns the candidates — nothing settled", async () => {
        m.execute.mockResolvedValue({ ok: false, status: 409, error: "Possible match", candidates: [{ record_id: "p-1" }] });
        const res = await call(commit, commitBody);
        expect(res.status).toBe(409);
        expect((await res.json()).candidates).toEqual([{ record_id: "p-1" }]);
        expect(m.release).toHaveBeenCalledTimes(1);
        expect(m.settle).not.toHaveBeenCalled();
    });

    it("a rejected proposal is never committed", async () => {
        m.metadata = { related_record_proposals: { decisions: { [PID]: { instance_decision: "reject" } } } };
        const res = await call(commit, commitBody);
        expect(res.status).toBe(409);
        expect(m.claim).not.toHaveBeenCalled();
        expect(m.execute).not.toHaveBeenCalled();
    });

    it("a replay of a committed request does not claim and still settles (idempotent)", async () => {
        m.claim.mockResolvedValue({ ok: true, alreadyCommitted: true });
        m.execute.mockResolvedValue({ ok: true, alreadyDone: true, result: { record_id: "cm-new" }, identity_outcome: null, audit_event_id: "evt" });
        const res = await call(commit, commitBody);
        expect(res.status).toBe(200);
        expect((await res.json()).data.alreadyDone).toBe(true);
        expect(m.settle).toHaveBeenCalledTimes(1);
    });
});

describe("reject", () => {
    it("operator-only", async () => {
        m.ctx.mockResolvedValue({ ok: true, orgId: "org", userId: "u", role: "staff", permissionKeys: [] });
        expect((await call(reject, { reason: "x" })).status).toBe(403);
        expect(m.reject).not.toHaveBeenCalled();
    });

    it("records the decision with the reason and the family's request", async () => {
        const res = await call(reject, { reason: "  Not our family  " });
        expect(res.status).toBe(200);
        expect(m.reject.mock.calls[0]![1]).toMatchObject({ caseId: CASE, proposalId: PID, reason: "Not our family", request });
    });

    it("only a proposed new child can be rejected here", async () => {
        m.context = { ...(m.context as object), proposal: { proposal_id: PID, origin: "existing_record", collection_provider_ref: "children" } };
        expect((await call(reject, {})).status).toBe(403);
        m.context = null;
        expect((await call(reject, {})).status).toBe(404);
        expect(m.reject).not.toHaveBeenCalled();
    });
});
