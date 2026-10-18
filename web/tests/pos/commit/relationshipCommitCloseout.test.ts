/**
 * PROCESSING CLOSEOUT — measured on deployed staging (Ben ZZQA1484F21611's submitted Admissions packet):
 *
 *   • every child-scoped relationship commit from the operator panel (which sends no anchor) was
 *     refused "requires an explicit child" — although the submission itself names its child;
 *   • a relationship proposal could not be rejected durably (the commit route answered 403 and
 *     recorded nothing);
 *   • the temporary #1491 404 body exposed proposal ids and database text.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    context: null as unknown,
    anchorRequests: [] as unknown[],
    emitEvent: vi.fn(async () => "evt-1"),
}));
vi.mock("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase", async (orig) => {
    const real = await orig<typeof import("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase")>();
    return { ...real, loadRelatedRecordProposalForCase: async () => m.context };
});
vi.mock("@/lib/pos/processingCase/commit/verifyRelationshipCommitAuthorization", () => ({
    verifyRelationshipCommitAuthorization: () => ({
        ok: true,
        definition: { definition_key: "emergency_contacts", label: "Emergency Contacts" },
        resolved: { scope: "this_child", commandKey: "add_emergency_contact", roleKey: "emergency_contact", identityAction: "create_proposed_person" },
        proposal: (m.context as { proposal: unknown }).proposal,
    }),
}));
vi.mock("@/lib/pos/processingCase/commit/loadResolvedProcessingCaseContext", () => ({
    loadResolvedProcessingCaseContext: async () => ({ customer_id: "house-1", customer_member_ids: ["ben", "ava"], resolution_revision: "r1" }),
    resolveCommitHousehold: () => ({ ok: true, customer_id: "house-1", revision: "r1", context: { customer_member_ids: ["ben", "ava"] } }),
}));
vi.mock("@/lib/pos/processingCase/commit/resolveRelationshipAnchor", () => ({
    resolveRelationshipAnchor: (input: { request: unknown }) => {
        m.anchorRequests.push(input.request);
        return { ok: false, status: 400, code: "probe", reason: "stop after the anchor request" };
    },
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: (...a: unknown[]) => m.emitEvent(...(a as [])) }));

import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";
import { rejectNewChildProposal, relationshipAlreadyApplied } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { isRejectedProposal } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { proposalNotFound } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";

const proposal = { proposal_id: "p-ec", origin: "proposed_new_record", collection_provider_ref: "person.contact_role.emergency_contacts", execution_kind: "configured_relationship", status: "valid" };
const run = (anchorCustomerMemberId: string | null) =>
    executeRelationshipProposalCommit({
        supabase: {} as never, orgId: "org", userId: "op", actorRole: "admin", accessScope: null, caseId: "case-1", proposalId: "p-ec",
        decision: { proposal_id: "p-ec", instance_decision: "approve", field_decisions: [] }, metadata: {}, anchorCustomerMemberId,
    } as never);

beforeEach(() => {
    m.anchorRequests = [];
    m.emitEvent.mockClear();
});

describe("a child-scoped relationship is anchored to the child the submission is about", () => {
    it("no explicit anchor: the submission's own child anchors it (still validated by the anchor resolver)", async () => {
        m.context = { proposal, expectedCustomerId: "house-1", expectedCustomerMemberId: "ben", source: { source_kind: "form_submission", source_id: "sub-1" } };
        await run(null);
        expect(m.anchorRequests[0]).toMatchObject({ customerId: "house-1", customerMemberId: "ben", scope: "this_child" });
    });

    it("an operator's explicit child wins", async () => {
        m.context = { proposal, expectedCustomerId: "house-1", expectedCustomerMemberId: "ben", source: { source_kind: "form_submission", source_id: "sub-1" } };
        await run("ava");
        expect(m.anchorRequests[0]).toMatchObject({ customerMemberId: "ava" });
    });

    it("a source that names no child is NOT given one — the resolver refuses as before", async () => {
        m.context = { proposal, expectedCustomerId: "house-1", expectedCustomerMemberId: null, source: { source_kind: "form_submission", source_id: "sub-1" } };
        await run(null);
        expect(m.anchorRequests[0]).toMatchObject({ customerMemberId: null });
    });
});

type Row = Record<string, unknown>;
function db(cases: Row[]) {
    return {
        from(table: string) {
            const rows = table === "processing_cases" ? cases : [];
            const filters: Array<(r: Row) => boolean> = [];
            let patch: Row | null = null;
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                update: (p: Row) => { patch = p; return api; },
                maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
                then: (res: (v: unknown) => void) => {
                    const hit = rows.filter((r) => filters.every((f) => f(r)));
                    if (patch) for (const r of hit) Object.assign(r, patch);
                    res({ data: hit, error: null });
                },
            };
            return api;
        },
    } as never;
}

describe("a relationship proposal can be rejected durably — and only before it is committed", () => {
    it("records the decision and an audit event; the commit route then refuses it", async () => {
        const cases: Row[] = [{ id: "case-1", org_id: "org", status: "received", metadata: {} }];
        const r = await rejectNewChildProposal(db(cases), { orgId: "org", userId: "op", caseId: "case-1", proposalId: "p-ec", metadata: {}, reason: "Duplicate contact", request: null, commitKind: "relationship" });
        expect(r).toEqual({ ok: true, alreadyDone: false });
        expect(isRejectedProposal(cases[0]!.metadata, "p-ec")).toBe(true);
        expect(m.emitEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "processing_related_record_proposal_rejected", payload: expect.objectContaining({ commit_kind: "relationship", reason: "Duplicate contact" }) }));
        // A packet case is not completed by one rejection; its other proposals are still the operator's.
        expect(cases[0]!.status).toBe("received");
    });

    it("an applied relationship cannot be rejected", async () => {
        const metadata = { relationship_collection_commits: { k: { proposal_id: "p-ec", outcome: "applied" } } };
        expect(relationshipAlreadyApplied(metadata, "p-ec")).toBe(true);
        const r = await rejectNewChildProposal(db([{ id: "case-1", org_id: "org", metadata }]), { orgId: "org", userId: "op", caseId: "case-1", proposalId: "p-ec", metadata, reason: null, request: null, commitKind: "relationship" });
        expect(r).toMatchObject({ ok: false, status: 409 });
    });
});

describe("a proposal the case does not hold: a category and a correlation id, nothing internal", () => {
    it("never returns proposal ids, source ids or database text", async () => {
        const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ source_kind: "participant_child_request" }], error: null }) }) }) }) } as never;
        const res = await proposalNotFound({ supabase, orgId: "org", caseId: "case-1", proposalId: "rrp:participant_child_request:abc-secret-id:children:abc-secret-id" });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(Object.keys(body).sort()).toEqual(["category", "code", "correlation_id", "error"]);
        expect(body.category).toBe("no_source_holds_proposal");
        expect(JSON.stringify(body)).not.toMatch(/abc-secret-id|participant_child_request/);
    });
});
