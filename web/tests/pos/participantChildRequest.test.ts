/**
 * A FAMILY'S NEW CHILD IS A PROCESSING SOURCE — reviewed, corrected, rejected or committed once.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    emitEvent: vi.fn(async () => "evt-1"),
    requestEnrollment: vi.fn(),
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: (...a: unknown[]) => mocks.emitEvent(...(a as [])) }));
vi.mock("@/lib/enrollment/family/participantEnrollmentRequest", async (orig) => {
    const real = await orig<typeof import("@/lib/enrollment/family/participantEnrollmentRequest")>();
    return { ...real, requestEnrollmentForExistingChild: (...a: unknown[]) => mocks.requestEnrollment(...a) };
});

import {
    adaptParticipantChildRequestToRelatedRecordProposals,
    listOpenParticipantChildRequests,
    participantChildRequestProposalId,
    submitParticipantChildRequest,
    validateNewChildStatement,
    type ParticipantChildRequestRow,
} from "@/lib/pos/processingCase/sources/participantChildRequest";
import {
    claimParticipantChildRequestForCommit,
    isRejectedProposal,
    rejectNewChildProposal,
    releaseParticipantChildRequestClaim,
    settleParticipantChildRequestAfterCommit,
} from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { newChildIdentityFromProposal, verifyNewChildCommitAuthorization } from "@/lib/pos/processingCase/commit/executeNewChildProposalCommit";
import { makeDefaultSourceEvidenceRegistry } from "@/lib/pos/processingCase/readModel/processingCaseEvidenceDb";
import { fakeDb, type Tables } from "./fakeProcessingDb";

const ORG = "org";
const HOUSE = "house-1";

let tables: Tables;
beforeEach(() => {
    tables = {
        customer_members: [
            { id: "cm-ava", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true, first_name: "Ava", last_name: "Example" },
            { id: "cm-zed", org_id: ORG, customer_id: "house-2", relationship: "child", is_active: true, first_name: "Dex", last_name: "Example" },
        ],
        processing_participant_child_requests: [],
        processing_cases: [],
        processing_case_sources: [],
    };
    mocks.emitEvent.mockClear();
    mocks.requestEnrollment.mockReset();
    mocks.requestEnrollment.mockResolvedValue({ ok: true, participationId: "ocm-1", created: true });
});

const submit = (child: Record<string, unknown>, customerId = HOUSE) =>
    submitParticipantChildRequest(fakeDb(tables) as never, {
        orgId: ORG,
        customerId,
        opportunityId: "opp-1",
        requestedByPersonId: "person-parent",
        child: { firstName: child.first, lastName: child.last, dateOfBirth: child.dob },
    });

describe("what a family must tell the school", () => {
    const today = new Date("2026-10-18T00:00:00Z");
    it.each([
        [{ firstName: "", lastName: "Example", dateOfBirth: "2021-05-01" }, "first_name"],
        [{ firstName: "Dex", lastName: " ", dateOfBirth: "2021-05-01" }, "last_name"],
        [{ firstName: "Dex", lastName: "Example", dateOfBirth: "" }, "date_of_birth"],
        [{ firstName: "Dex", lastName: "Example", dateOfBirth: "2021-02-30" }, "date_of_birth"],
        [{ firstName: "Dex", lastName: "Example", dateOfBirth: "2030-01-01" }, "date_of_birth"],
        [{ firstName: "Dex", lastName: "Example", dateOfBirth: "05/01/2021" }, "date_of_birth"],
    ])("%o is refused at %s", (input, field) => {
        const v = validateNewChildStatement(input, today);
        expect(v.ok).toBe(false);
        expect(!v.ok && v.refusal.field).toBe(field);
    });

    it("a first and last name and a real date of birth are enough; whitespace is tidied", () => {
        expect(validateNewChildStatement({ firstName: "  Dex ", lastName: "Van  Example", dateOfBirth: "2021-05-01" }, today)).toEqual({
            ok: true, firstName: "Dex", lastName: "Van Example", dateOfBirth: "2021-05-01",
        });
    });
});

describe("a family's new child becomes a Processing source, not a child", () => {
    it("records the statement and opens one Processing case whose primary source is it", async () => {
        const r = await submit({ first: "Dex", last: "Example", dob: "2021-05-01" });
        expect(r.ok).toBe(true);
        expect(tables.processing_participant_child_requests).toHaveLength(1);
        expect(tables.processing_participant_child_requests![0]).toMatchObject({ customer_id: HOUSE, opportunity_id: "opp-1", requested_by_person_id: "person-parent", status: "pending" });
        expect(tables.processing_case_sources).toEqual([
            expect.objectContaining({ source_kind: "participant_child_request", source_id: r.ok && r.requestId, role: "primary" }),
        ]);
        // Nothing canonical: no child, no participation.
        expect(tables.customer_members).toHaveLength(2);
        expect(tables.opportunity_customer_members).toBeUndefined();
    });

    it("sending the same child again is the same request and the same case", async () => {
        const a = await submit({ first: "Dex", last: "Example", dob: "2021-05-01" });
        const b = await submit({ first: "dex ", last: "EXAMPLE", dob: "2021-05-01" });
        expect(b).toEqual({ ...a, created: false });
        expect(tables.processing_participant_child_requests).toHaveLength(1);
        expect(tables.processing_cases).toHaveLength(1);
    });

    it("a child already in THIS household is refused and pointed at; another household's same name is not", async () => {
        const mine = await submit({ first: "Ava", last: "example", dob: "2020-01-01" });
        expect(mine).toMatchObject({ ok: false, refusal: { code: "already_in_household", customerMemberId: "cm-ava" } });
        const notMine = await submit({ first: "Dex", last: "Example", dob: "2021-05-01" });
        expect(notMine.ok).toBe(true);
    });

    it("a concurrent identical insert that loses the unique index answers with the winner", async () => {
        const first = await submit({ first: "Dex", last: "Example", dob: "2021-05-01" });
        // Simulate the race: the pre-read misses, the insert hits the index.
        const db = fakeDb(tables);
        const from = db.from.bind(db);
        let reads = 0;
        (db as { from: unknown }).from = (t: string) => {
            const api = from(t) as Record<string, unknown>;
            if (t === "processing_participant_child_requests" && reads++ === 0) {
                return { ...api, select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }) }) };
            }
            return api;
        };
        const second = await submitParticipantChildRequest(db as never, {
            orgId: ORG, customerId: HOUSE, opportunityId: "opp-1", requestedByPersonId: null,
            child: { firstName: "Dex", lastName: "Example", dateOfBirth: "2021-05-01" },
        });
        expect(second.ok && second.requestId).toBe(first.ok && first.requestId);
        expect(tables.processing_participant_child_requests).toHaveLength(1);
    });
});

const pendingRow = (over: Partial<ParticipantChildRequestRow> = {}): ParticipantChildRequestRow => ({
    id: "req-1", org_id: ORG, customer_id: HOUSE, opportunity_id: "opp-1", requested_by_person_id: "person-parent",
    first_name: "Dex", last_name: "Example", date_of_birth: "2021-05-01", status: "pending", customer_member_id: null,
    decided_at: null, decision_reason: null, created_at: "2026-10-18T00:00:00Z", ...over,
});

describe("the same canonical proposal the Processing new-child commit consumes", () => {
    it("one children proposal, proposed_new_record, whose identity and household commit verifies", () => {
        const [proposal] = adaptParticipantChildRequestToRelatedRecordProposals(pendingRow()).collections[0]!.instances;
        expect(proposal!.proposal_id).toBe(participantChildRequestProposalId("req-1"));
        expect(newChildIdentityFromProposal(proposal!)).toEqual({ ok: true, identity: { firstName: "Dex", lastName: "Example", dob: "2021-05-01" } });
        expect(newChildIdentityFromProposal(proposal!, { firstName: "Dexter" })).toEqual({ ok: true, identity: { firstName: "Dexter", lastName: "Example", dob: "2021-05-01" } });
        const auth = verifyNewChildCommitAuthorization({
            proposalId: proposal!.proposal_id,
            proposalContext: { proposal: proposal!, expectedCustomerId: HOUSE, source: { source_kind: "participant_child_request", source_id: "req-1" } },
        });
        expect(auth).toMatchObject({ ok: true, customerId: HOUSE });
    });

    it("the commit loader finds it through the case's source, with the request's household, org-scoped", async () => {
        tables.processing_participant_child_requests = [pendingRow(), pendingRow({ id: "req-foreign", org_id: "other-org", customer_id: "house-x" })];
        tables.processing_case_sources = [
            { org_id: ORG, processing_case_id: "case-1", source_kind: "participant_child_request", source_id: "req-1" },
            { org_id: ORG, processing_case_id: "case-2", source_kind: "participant_child_request", source_id: "req-foreign" },
        ];
        const ctx = await loadRelatedRecordProposalForCase({ supabase: fakeDb(tables) as never, orgId: ORG, caseId: "case-1", proposalId: participantChildRequestProposalId("req-1") });
        expect(ctx?.expectedCustomerId).toBe(HOUSE);
        expect(ctx?.participantChildRequest?.id).toBe("req-1");
        expect(await loadRelatedRecordProposalForCase({ supabase: fakeDb(tables) as never, orgId: ORG, caseId: "case-2", proposalId: participantChildRequestProposalId("req-foreign") })).toBeNull();
        expect(await loadRelatedRecordProposalForCase({ supabase: fakeDb(tables) as never, orgId: ORG, caseId: "case-1", proposalId: participantChildRequestProposalId("req-other") })).toBeNull();
    });

    it("the operator's case view shows what the family sent and the reviewable proposal", async () => {
        tables.processing_participant_child_requests = [pendingRow()];
        const loader = makeDefaultSourceEvidenceRegistry(fakeDb(tables) as never, ORG, { permissionKeys: ["health.view"] }).get("participant_child_request")!;
        const ev = (await loader(["req-1"])).get("req-1")!;
        expect(ev.proposedValues.map((v) => `${v.label}=${v.value}`)).toEqual(["First name=Dex", "Last name=Example", "Date of birth=2021-05-01", "Request=pending"]);
        const inst = ev.collectionEvidence!.groups[0]!.instances[0]!;
        expect(inst).toMatchObject({ collection_provider_ref: "children", iteration_entity_type: "customer_member", origin: "respondent_added", status: "valid" });
    });
});

describe("one commit at a time, and a decision is final", () => {
    beforeEach(() => {
        tables.processing_participant_child_requests = [pendingRow()];
    });

    it("two concurrent claims: exactly one wins", async () => {
        const db = fakeDb(tables) as never;
        const [a, b] = await Promise.all([
            claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-1" }),
            claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-2" }),
        ]);
        expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
        expect([a, b].find((x) => !x.ok)).toMatchObject({ status: 409, code: "in_progress" });
    });

    it("a released claim (e.g. the operator must choose between candidates) can be claimed again; an abandoned one expires", async () => {
        const db = fakeDb(tables) as never;
        expect((await claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-1" })).ok).toBe(true);
        await releaseParticipantChildRequestClaim(db, { orgId: ORG, requestId: "req-1" });
        expect((await claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-1" })).ok).toBe(true);
        expect((await claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-2" })).ok).toBe(false);
        const later = Date.now() + 3 * 60 * 1000;
        expect((await claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow(), userId: "op-2", nowMs: later })).ok).toBe(true);
    });

    it("a rejected request is never committed; the reject records the decision, completes the case, creates nothing", async () => {
        tables.processing_cases = [{ id: "case-1", org_id: ORG, status: "received", metadata: {} }];
        const db = fakeDb(tables) as never;
        const proposalId = participantChildRequestProposalId("req-1");
        const r = await rejectNewChildProposal(db, { orgId: ORG, userId: "op-1", caseId: "case-1", proposalId, metadata: {}, reason: "Not our family", request: pendingRow() });
        expect(r).toEqual({ ok: true, alreadyDone: false });
        expect(tables.processing_participant_child_requests![0]).toMatchObject({ status: "declined", decision_reason: "Not our family", decided_by: "op-1" });
        expect(tables.processing_cases![0]).toMatchObject({ status: "completed" });
        expect(isRejectedProposal(tables.processing_cases![0]!.metadata, proposalId)).toBe(true);
        expect(mocks.emitEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "processing_related_record_proposal_rejected" }));
        expect(tables.customer_members).toHaveLength(2);
        expect(mocks.requestEnrollment).not.toHaveBeenCalled();

        const claim = await claimParticipantChildRequestForCommit(db, { orgId: ORG, request: pendingRow({ status: "declined" }), userId: "op-1" });
        expect(claim).toMatchObject({ ok: false, code: "declined" });
    });

    it("a committed child can no longer be rejected", async () => {
        const r = await rejectNewChildProposal(fakeDb(tables) as never, {
            orgId: ORG, userId: "op-1", caseId: "case-1", proposalId: "p", reason: null,
            metadata: { related_record_proposals: { commit_results: { p: { record_id: "cm-new" } } } },
            request: pendingRow({ status: "committed", customer_member_id: "cm-new" }),
        });
        expect(r).toMatchObject({ ok: false, status: 409 });
    });
});

describe("after the commit: the request records its child, the case completes, the Enrollment REQUEST is made", () => {
    beforeEach(() => {
        tables.processing_participant_child_requests = [pendingRow()];
        tables.processing_cases = [{ id: "case-1", org_id: ORG, status: "received", metadata: { related_record_proposals: { commit_results: { x: {} } } } }];
    });

    it("settles once — a replay finds everything already done", async () => {
        const db = fakeDb(tables) as never;
        const first = await settleParticipantChildRequestAfterCommit(db, { orgId: ORG, userId: "op-1", caseId: "case-1", request: pendingRow(), customerMemberId: "cm-new" });
        expect(first).toEqual({ requestStatus: "committed", enrollmentRequest: { outcome: "requested", created: true } });
        expect(tables.processing_participant_child_requests![0]).toMatchObject({ status: "committed", customer_member_id: "cm-new" });
        expect(tables.processing_cases![0]).toMatchObject({ status: "completed" });
        // The commit's stored result survives completion.
        expect((tables.processing_cases![0]!.metadata as Record<string, unknown>).related_record_proposals).toBeTruthy();
        expect(mocks.requestEnrollment).toHaveBeenCalledWith(db, { orgId: ORG, customerId: HOUSE, opportunityId: "opp-1", customerMemberId: "cm-new" });

        mocks.requestEnrollment.mockResolvedValueOnce({ ok: false, refusal: { code: "already_active", message: "", status: "being_reviewed" } });
        const replay = await settleParticipantChildRequestAfterCommit(db, { orgId: ORG, userId: "op-1", caseId: "case-1", request: pendingRow(), customerMemberId: "cm-new" });
        expect(replay).toEqual({ requestStatus: "committed", enrollmentRequest: { outcome: "requested", created: false } });
    });

    it("the request is the family's: once committed it is no longer shown as a request", async () => {
        await settleParticipantChildRequestAfterCommit(fakeDb(tables) as never, { orgId: ORG, userId: "op-1", caseId: "case-1", request: pendingRow(), customerMemberId: "cm-new" });
        expect(await listOpenParticipantChildRequests(fakeDb(tables) as never, { orgId: ORG, customerId: HOUSE })).toEqual([]);
    });
});

describe("the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20261124090000_processing_participant_child_requests.sql"), "utf8");
    const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

    it("keeps every historical source kind and adds only participant_child_request — still a closed list", () => {
        const kinds = [...code.matchAll(/'([a-z_]+)'::text,?\s*$/gm)].map((m) => m[1]).filter((k) => !["pending", "committed", "declined", "owner", "admin", "ops", "manager"].includes(k!));
        expect(kinds).toEqual([
            "form_submission", "form_packet_session", "document", "upload", "email_attachment", "import", "recreated_document", "create_lead",
            "participant_child_request",
        ]);
        expect(code).toMatch(/ADD CONSTRAINT chk_pcs_source_kind CHECK \(\s*source_kind = ANY \(ARRAY\[/);
    });

    it("is replay-safe: every statement is guarded", () => {
        expect(code).toContain("CREATE TABLE IF NOT EXISTS public.processing_participant_child_requests");
        expect(code).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_ppcr_one_pending_per_child");
        expect(code).toContain("DROP CONSTRAINT IF EXISTS chk_pcs_source_kind");
        expect(code.match(/CREATE POLICY/g)).toHaveLength(code.match(/DROP POLICY IF EXISTS/g)!.length);
        expect(code).not.toMatch(/\bDROP TABLE\b|\bDROP COLUMN\b|\bDELETE FROM\b|\bUPDATE public\./);
    });

    it("the new table is never world-readable: RLS, org-scoped select, service role", () => {
        expect(code).toContain("ALTER TABLE public.processing_participant_child_requests ENABLE ROW LEVEL SECURITY");
        expect(code).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.has_org_role\(org_id/);
    });

    it("one pending request per child per household, and a committed request names its child", () => {
        expect(code).toMatch(/uq_ppcr_one_pending_per_child[\s\S]*WHERE status = 'pending'/);
        expect(code).toContain("CHECK (status <> 'committed' OR customer_member_id IS NOT NULL)");
    });
});
