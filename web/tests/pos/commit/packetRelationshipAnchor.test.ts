/**
 * A RELATIONSHIP FROM A SUBMITTED ENROLLMENT PACKET CAN BE COMMITTED.
 *
 * Measured on staging (cc2515f7, Ben ZZQA1484F21611's packet case 93f2ef7d): a packet case has no
 * identity resolution, so the household is the submission's — and the resolved context holds no
 * children, so even the child the paperwork is about was "not found in the resolved household".
 * Real household and anchor resolvers; only storage, the gate and the command runtime are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ context: null as unknown, invocations: [] as unknown[] }));
vi.mock("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase", async (orig) => {
    const real = await orig<typeof import("@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase")>();
    return { ...real, loadRelatedRecordProposalForCase: async () => m.context };
});
vi.mock("@/lib/pos/processingCase/commit/verifyRelationshipCommitAuthorization", () => ({
    verifyRelationshipCommitAuthorization: () => ({
        ok: true,
        definition: { definition_key: "emergency_contacts", label: "Emergency Contacts", scopes: ["this_child"] },
        resolved: { scope: "this_child", commandKey: "add_emergency_contact", roleKey: "emergency_contact", identityAction: "create_proposed_person" },
        proposal: { relationship_intent: { proposed_person_facts: [
            { entity_type: "person", field_key: "first_name", value: "Nadia" },
            { entity_type: "person", field_key: "last_name", value: "Haddad" },
            { entity_type: "person", field_key: "phone", value: "5550100777" },
        ] } },
    }),
}));
vi.mock("@/lib/platform/commands/runtime/executeCommandInvocation", () => ({
    executeCommandInvocation: async (inv: unknown) => {
        m.invocations.push(inv);
        return { ok: true, status: "succeeded", output: {} };
    },
}));

import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";

type Row = Record<string, unknown>;
function db(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                update: () => api,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        },
    } as never;
}

const tables = () => ({
    // A packet case: no operational_result, so no resolved household.
    processing_cases: [{ id: "case-1", org_id: "org", status: "received", metadata: {}, updated_at: "t" }],
    customer_members: [
        { id: "ben", org_id: "org", customer_id: "house-1", relationship: "child", is_active: true },
        { id: "ava", org_id: "org", customer_id: "house-1", relationship: "child", is_active: true },
        { id: "zed", org_id: "org", customer_id: "house-2", relationship: "child", is_active: true },
    ],
});
const run = (anchor: string | null, t = tables()) =>
    executeRelationshipProposalCommit({
        supabase: db(t), orgId: "org", userId: "op", actorRole: "admin", accessScope: null, caseId: "case-1", proposalId: "p-ec",
        decision: { proposal_id: "p-ec", instance_decision: "approve", field_decisions: [] }, metadata: {}, anchorCustomerMemberId: anchor,
    } as never);

beforeEach(() => {
    m.invocations = [];
    m.context = { proposal: { proposal_id: "p-ec" }, expectedCustomerId: "house-1", expectedCustomerMemberId: "ben", source: { source_kind: "form_submission", source_id: "sub-1" } };
});

describe("a packet case's relationship anchors to the submission's child in the submission's household", () => {
    it("reaches the canonical write anchored to the paperwork's child", async () => {
        const out = await run(null);
        expect(out.record.reason ?? null).toBeNull();
        expect(m.invocations).toHaveLength(1);
        expect(JSON.stringify(m.invocations[0])).toContain("ben");
    });

    it("an explicit child of the same household is accepted", async () => {
        await run("ava");
        expect(JSON.stringify(m.invocations[0])).toContain("ava");
    });

    it("another household's child is still refused", async () => {
        const out = await run("zed");
        expect(out.ok).toBe(false);
        expect(out.record.code).toBe("anchor_not_found");
        expect(m.invocations).toHaveLength(0);
    });

    it("a submission with no household still refuses — nothing is inferred", async () => {
        m.context = { ...(m.context as object), expectedCustomerId: null };
        const out = await run(null);
        expect(out.ok).toBe(false);
        expect(out.record.code).toBe("case_has_no_resolved_household");
        expect(m.invocations).toHaveLength(0);
    });
});
