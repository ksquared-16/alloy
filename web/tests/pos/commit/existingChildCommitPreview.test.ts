import { describe, expect, it } from "vitest";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import { buildExistingChildCommitPreview } from "@/lib/pos/processingCase/commit/children/buildExistingChildCommitPreview";

const proposal: RelatedRecordInstanceProposal = {
    proposal_id: "rrp:child-1",
    collection_provider_ref: "children",
    item_entity_type: "customer_member",
    instance_key: "cm-1",
    origin: "existing_record",
    existing_record_id: "cm-1",
    field_proposals: [
        { provider_ref: "child.child_first_name", submitted_value: "Sam", observed_value: "Samuel", label: "First Name" },
        { provider_ref: "child.preferred_language", submitted_value: "Spanish", label: "Preferred Language" },
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

describe("buildExistingChildCommitPreview", () => {
    it("shows current, proposed, decision, and update/skip/block actions", () => {
        const preview = buildExistingChildCommitPreview({
            proposal,
            decision: {
                proposal_id: "rrp:child-1",
                field_decisions: [
                    { provider_ref: "child.child_first_name", decision: "approve" },
                    { provider_ref: "child.preferred_language", decision: "defer" },
                ],
            },
            currentRecord: record,
            orgId: "org-1",
            expectedCustomerId: "cust-1",
        });
        expect(preview.can_commit).toBe(true);
        expect(preview.fields.find((f) => f.provider_ref === "child.child_first_name")).toMatchObject({ action: "update", current_value: "Samuel", canonical_field_key: "first_name" });
        expect(preview.fields.find((f) => f.provider_ref === "child.preferred_language")?.action).toBe("skip");
    });

    it("blocks stale conflicts explicitly", () => {
        const preview = buildExistingChildCommitPreview({
            proposal: {
                ...proposal,
                field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Sam", observed_value: "Old", label: "First Name" }],
            },
            decision: { proposal_id: "rrp:child-1", instance_decision: "approve", field_decisions: [] },
            currentRecord: record,
            orgId: "org-1",
            expectedCustomerId: "cust-1",
        });
        expect(preview.can_commit).toBe(false);
        expect(preview.fields[0]?.action).toBe("block");
        expect(preview.review_state).toBe("blocked_by_conflict");
    });
});
