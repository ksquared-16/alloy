/**
 * PROCESSING COMMIT FOR A NEW CHILD — reviewed, identity-safe, created once, in its own household.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    proposalContext: null as unknown,
    addChild: vi.fn(),
    emitEvent: vi.fn(async () => "evt-1"),
}));
vi.mock("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase", () => ({
    loadRelatedRecordProposalForCase: async () => mocks.proposalContext,
}));
vi.mock("@/lib/records/addChildService", async (orig) => {
    const real = await orig<typeof import("@/lib/records/addChildService")>();
    return { ...real, addChild: (...a: unknown[]) => mocks.addChild(...a) };
});
vi.mock("@/lib/emitEvent", () => ({ emitEvent: (...a: unknown[]) => mocks.emitEvent(...(a as [])) }));

import { ChildIdentityChoiceRequiredError } from "@/lib/records/addChildService";
import {
    executeNewChildProposalCommit,
    newChildIdempotencyKey,
    newChildIdentityFromProposal,
    verifyNewChildCommitAuthorization,
} from "@/lib/pos/processingCase/commit/executeNewChildProposalCommit";

const ORG = "org";
const HOUSE = "house-1";
const proposal = (over: Record<string, unknown> = {}) => ({
    proposal_id: "prop-1",
    collection_provider_ref: "children",
    item_entity_type: "customer_member",
    origin: "proposed_new_record",
    status: "valid",
    field_proposals: [
        { provider_ref: "emergency_contacts_2_full_name", source_fact_ref: "emergency_contacts_2_full_name", submitted_value: "Sam Q Sibling", label: "Full name" },
        { provider_ref: "emergency_contacts_2_date_of_birth", source_fact_ref: "emergency_contacts_2_date_of_birth", submitted_value: "2021-05-01", label: "Date of birth" },
    ],
    ...over,
});
const context = (p = proposal(), customerId: string | null = HOUSE) => ({ proposal: p, expectedCustomerId: customerId, source: { kind: "form_submission", id: "sub-1" } });

let caseUpdates: Record<string, unknown>[];
let members: Record<string, unknown>[];
function db() {
    return {
        from(table: string) {
            let rows = table === "customer_members" ? [...members] : [];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                update: (patch: Record<string, unknown>) => {
                    if (table === "processing_cases") caseUpdates.push(patch);
                    const chain: Record<string, unknown> = { eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
                    return chain;
                },
            };
            return api;
        },
    } as never;
}

const run = (metadata: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) =>
    executeNewChildProposalCommit({ supabase: db(), orgId: ORG, userId: "op-1", caseId: "case-1", proposalId: "prop-1", metadata, choice: choice as never });

beforeEach(() => {
    caseUpdates = [];
    members = [
        { id: "cm-ben", org_id: ORG, customer_id: HOUSE, relationship: "child", is_active: true },
        { id: "cm-zed", org_id: ORG, customer_id: "other-house", relationship: "child", is_active: true },
    ];
    mocks.proposalContext = context();
    mocks.addChild.mockReset();
    mocks.addChild.mockResolvedValue({ customerMemberId: "cm-new", personId: "p-new", customerId: HOUSE, displayName: "Sam Q Sibling", identityOutcome: "created_new", membersCreated: 1 });
    mocks.emitEvent.mockClear();
});

describe("the child's identity, from the proposal and the operator's corrections", () => {
    it("a full name splits at its last space; the date of birth is carried", () => {
        expect(newChildIdentityFromProposal(proposal() as never)).toEqual({ ok: true, identity: { firstName: "Sam Q", lastName: "Sibling", dob: "2021-05-01" } });
    });
    it("operator corrections win", () => {
        const r = newChildIdentityFromProposal(proposal() as never, { firstName: "Samuel", dob: "2021-06-01" });
        expect(r).toEqual({ ok: true, identity: { firstName: "Samuel", lastName: "Sibling", dob: "2021-06-01" } });
    });
    it("a single name cannot become a child without a correction", () => {
        const single = proposal({ field_proposals: [{ provider_ref: "x_full_name", source_fact_ref: "x_full_name", submitted_value: "Sam" }] });
        expect(newChildIdentityFromProposal(single as never).ok).toBe(false);
        expect(newChildIdentityFromProposal(single as never, { lastName: "Sibling" })).toMatchObject({ ok: true });
    });
    it("an invalid date is refused", () => {
        expect(newChildIdentityFromProposal(proposal() as never, { dob: "May 1" }).ok).toBe(false);
    });
});

describe("only a valid new-child proposal in a known household may commit", () => {
    it.each([
        [{ origin: "existing_record" }, 403],
        [{ collection_provider_ref: "person.contact_role.parents" }, 403],
        [{ status: "incomplete" }, 403],
    ])("%j → %i", (over, status) => {
        const r = verifyNewChildCommitAuthorization({ proposalId: "prop-1", proposalContext: context(proposal(over)) as never });
        expect(!r.ok && r.status).toBe(status);
    });
    it("a submission naming no household cannot create a child", () => {
        expect(verifyNewChildCommitAuthorization({ proposalId: "prop-1", proposalContext: context(proposal(), null) as never }).ok).toBe(false);
    });
});

describe("committing", () => {
    it("creates the child once, in the submission's household, and audits it", async () => {
        const r = await run();
        expect(r.ok && r.alreadyDone).toBe(false);
        expect(mocks.addChild).toHaveBeenCalledTimes(1);
        expect(mocks.addChild.mock.calls[0]![1]).toMatchObject({ orgId: ORG, customerId: HOUSE, firstName: "Sam Q", lastName: "Sibling", dob: "2021-05-01", createNewChild: false });
        expect(mocks.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: "processing_related_record_proposal_committed",
            entity_id: "cm-new",
            payload: expect.objectContaining({ commit_kind: "new_child", identity_outcome: "created_new" }),
        }));
        // The stored result is keyed to the proposal alone.
        const last = caseUpdates.at(-1)!.metadata as { related_record_proposals: { commit_results: Record<string, { record_id: string; idempotency_key: string }> } };
        expect(last.related_record_proposals.commit_results["prop-1"]).toMatchObject({ record_id: "cm-new", idempotency_key: newChildIdempotencyKey("prop-1") });
    });

    it("a retry returns the stored result and never creates a second child", async () => {
        await run();
        const stored = caseUpdates.at(-1)!.metadata as Record<string, unknown>;
        const again = await run(stored, { firstName: "Different" });
        expect(again.ok && again.alreadyDone).toBe(true);
        expect(mocks.addChild).toHaveBeenCalledTimes(1);
    });

    it("a possible duplicate is refused with its candidates, and the lock is released", async () => {
        mocks.addChild.mockRejectedValueOnce(new ChildIdentityChoiceRequiredError([{ record_id: "cm-ben", person_id: null, customer_member_id: "cm-ben", display_name: "Ben", confidence_band: "high", explanation: "Same name and birthday", in_household: true }] as never));
        const r = await run();
        expect(r.ok).toBe(false);
        expect(!r.ok && r.status).toBe(409);
        expect(!r.ok && r.candidates).toHaveLength(1);
        const released = caseUpdates.at(-1)!.metadata as { related_record_proposals: { commit_locks?: Record<string, unknown> } };
        expect(released.related_record_proposals.commit_locks?.["prop-1"]).toBeUndefined();
        expect(mocks.emitEvent).not.toHaveBeenCalled();
    });

    it("creating anyway is an explicit operator choice with a reason", async () => {
        await run({}, { createNewChild: true, createNewReason: "Twins — a different child" });
        expect(mocks.addChild.mock.calls[0]![1]).toMatchObject({ createNewChild: true, createNewReason: "Twins — a different child" });
    });

    it("linking an existing child is limited to this household's own active children", async () => {
        const other = await run({}, { chosenCustomerMemberId: "cm-zed" });
        expect(!other.ok && other.status).toBe(403);
        expect(mocks.addChild).not.toHaveBeenCalled();
        await run({}, { chosenCustomerMemberId: "cm-ben" });
        expect(mocks.addChild.mock.calls[0]![1]).toMatchObject({ customerMemberId: "cm-ben" });
    });

    it("a commit in progress elsewhere is respected", async () => {
        const locked = { related_record_proposals: { commit_locks: { "prop-1": { idempotency_key: "x", locked_at: new Date().toISOString(), locked_by: "op-2" } } } };
        const r = await run(locked);
        expect(!r.ok && r.status).toBe(409);
        expect(mocks.addChild).not.toHaveBeenCalled();
    });
});
