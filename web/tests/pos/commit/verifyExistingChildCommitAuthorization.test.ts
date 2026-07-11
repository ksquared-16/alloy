import { describe, expect, it } from "vitest";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import { verifyExistingChildCommitAuthorization } from "@/lib/pos/processingCase/commit/verifyExistingChildCommitAuthorization";

const baseProposal: RelatedRecordInstanceProposal = {
    proposal_id: "p1",
    collection_provider_ref: "children",
    item_entity_type: "customer_member",
    instance_key: "cm-1",
    origin: "existing_record",
    existing_record_id: "cm-1",
    field_proposals: [],
    source_lineage: { source_kind: "form_submission", source_record_id: "sub-1" },
    diagnostics: [],
    status: "valid",
};

const record = { id: "cm-1", org_id: "org-1", customer_id: "cust-1", first_name: "A", last_name: "B", dob: null };

describe("verifyExistingChildCommitAuthorization", () => {
    it("rejects cross-org and cross-household child records", () => {
        expect(verifyExistingChildCommitAuthorization({
            orgId: "org-1",
            caseId: "case-1",
            proposalId: "p1",
            proposalContext: { proposal: baseProposal, expectedCustomerId: "cust-1", source: { source_kind: "form_submission", source_id: "sub-1" } },
            currentRecord: { ...record, org_id: "other" },
        }).ok).toBe(false);
        expect(verifyExistingChildCommitAuthorization({
            orgId: "org-1",
            caseId: "case-1",
            proposalId: "p1",
            proposalContext: { proposal: baseProposal, expectedCustomerId: "cust-1", source: { source_kind: "form_submission", source_id: "sub-1" } },
            currentRecord: { ...record, customer_id: "other" },
        }).ok).toBe(false);
    });

    it("rejects tampered proposal ids and unsupported origins", () => {
        expect(verifyExistingChildCommitAuthorization({
            orgId: "org-1",
            caseId: "case-1",
            proposalId: "p1",
            proposalContext: { proposal: { ...baseProposal, proposal_id: "other" }, expectedCustomerId: "cust-1", source: { source_kind: "form_submission", source_id: "sub-1" } },
            currentRecord: record,
        }).ok).toBe(false);
        expect(verifyExistingChildCommitAuthorization({
            orgId: "org-1",
            caseId: "case-1",
            proposalId: "p1",
            proposalContext: { proposal: { ...baseProposal, origin: "proposed_new_record", existing_record_id: undefined }, expectedCustomerId: "cust-1", source: { source_kind: "form_submission", source_id: "sub-1" } },
            currentRecord: record,
        }).ok).toBe(false);
    });
});
