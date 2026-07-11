import { describe, expect, it } from "vitest";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { normalizeProposalDecision } from "@/lib/intake/proposals/decisions";
import { buildExistingChildCommitPlan } from "@/lib/pos/processingCase/commit/children/planExistingChildCommit";
import { resolveMutationCapability } from "@/lib/fields/mutation/resolveMutationCapability";

const baseProposal: RelatedRecordInstanceProposal = {
    proposal_id: "rrp:child-1",
    collection_provider_ref: "children",
    item_entity_type: "customer_member",
    instance_key: "cm-1",
    origin: "existing_record",
    existing_record_id: "cm-1",
    field_proposals: [
        { provider_ref: "child.child_first_name", submitted_value: "Sam", observed_value: "Samuel", label: "First" },
        { provider_ref: "child.child_last_name", submitted_value: "Lee", observed_value: "Li", label: "Last" },
        { provider_ref: "child.preferred_language", submitted_value: "Spanish", label: "Language" },
    ],
    source_lineage: { source_kind: "import", source_record_id: "i1" },
    diagnostics: [],
    status: "valid",
};

const record = {
    id: "cm-1",
    org_id: "org-1",
    customer_id: "cust-1",
    profile: { first_name: "Samuel", last_name: "Li", dob: null },
};

function plan(proposal: RelatedRecordInstanceProposal, decision: RelatedRecordProposalDecision = { proposal_id: "rrp:child-1", field_decisions: [{ provider_ref: "child.child_first_name", decision: "approve" }] }) {
    return buildExistingChildCommitPlan({ proposal, decision, currentRecord: record, orgId: "org-1", expectedCustomerId: "cust-1" });
}

describe("existing Child proposal commit planning", () => {
    it("supports field-level approve, reject, and defer without implicit approval", () => {
        const decision = normalizeProposalDecision({
            proposal_id: "rrp:child-1",
            field_decisions: [
                { provider_ref: "child.child_first_name", decision: "approve" },
                { provider_ref: "child.child_last_name", decision: "reject" },
            ],
        });
        const result = plan(baseProposal, decision);
        expect(result.approved_changes.map((c) => c.provider_ref)).toEqual(["child.child_first_name"]);
        expect(result.skipped_changes.find((s) => s.provider_ref === "child.child_last_name")?.outcome).toBe("rejected");
        expect(result.skipped_changes.find((s) => s.provider_ref === "child.preferred_language")?.outcome).toBe("deferred");
    });

    it("approve all expands to valid writable fields and skips unsupported providers", () => {
        const result = plan(baseProposal, { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] });
        expect(result.approved_changes.map((c) => c.canonical_ref.field_key)).toEqual(["first_name", "last_name"]);
        expect(result.skipped_changes.find((s) => s.provider_ref === "child.preferred_language")?.outcome).toBe("unsupported");
    });

    it("rejects proposed-new, parent, wrong collection, wrong entity, cross-org, and cross-household proposals", () => {
        expect(plan({ ...baseProposal, origin: "proposed_new_record", existing_record_id: undefined }).skipped_changes[0]?.outcome).toBe("unsupported");
        expect(plan({ ...baseProposal, collection_provider_ref: "person.contact_role.parents", item_entity_type: "person" }).skipped_changes[0]?.outcome).toBe("unsupported");
        expect(plan({ ...baseProposal, collection_provider_ref: "household.members" }).skipped_changes[0]?.outcome).toBe("unsupported");
        expect(plan({ ...baseProposal, item_entity_type: "person" }).skipped_changes[0]?.outcome).toBe("unsupported");
        expect(buildExistingChildCommitPlan({ proposal: baseProposal, decision: { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] }, currentRecord: { ...record, org_id: "other" }, orgId: "org-1", expectedCustomerId: "cust-1" }).skipped_changes[0]?.outcome).toBe("unauthorized");
        expect(buildExistingChildCommitPlan({ proposal: baseProposal, decision: { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] }, currentRecord: { ...record, customer_id: "other" }, orgId: "org-1", expectedCustomerId: "cust-1" }).skipped_changes[0]?.outcome).toBe("unauthorized");
    });

    it("omits unchanged values and blocks stale conflicts per field", () => {
        const already = plan({ ...baseProposal, field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Samuel", observed_value: "Samuel" }] }, { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] });
        expect(already.skipped_changes[0]?.outcome).toBe("unchanged");
        const stale = plan({ ...baseProposal, field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Sam", observed_value: "Old" }] }, { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] });
        expect(stale.skipped_changes[0]?.outcome).toBe("stale_conflict");
    });

    it("resolves canonical mutation capability for Forms child provider refs", () => {
        for (const providerRef of ["child.child_first_name", "child.child_last_name", "child.date_of_birth"]) {
            const cap = resolveMutationCapability(providerRef);
            expect(cap?.entity_type).toBe("customer_member");
            expect(cap?.writable).toBe(true);
        }
        expect(resolveMutationCapability("child.preferred_language")).toBeNull();
    });
});
