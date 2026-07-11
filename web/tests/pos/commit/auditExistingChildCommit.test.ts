import { describe, expect, it } from "vitest";
import { buildExistingChildCommitAuditPayload } from "@/lib/pos/processingCase/commit/auditExistingChildCommit";

describe("buildExistingChildCommitAuditPayload", () => {
    it("includes per-field outcomes and redacts sensitive values", () => {
        const payload = buildExistingChildCommitAuditPayload({
            org_id: "org-1",
            processing_case_id: "case-1",
            proposal_id: "p1",
            decision: { proposal_id: "p1", field_decisions: [{ provider_ref: "child.child_first_name", decision: "approve" }] },
            decision_version: "dv1",
            idempotency_key: "ik1",
            operator_id: "op-1",
            occurred_at: "2026-07-10T00:00:00.000Z",
            source: { source_kind: "form_submission", source_id: "sub-1" },
            result: {
                proposal_id: "p1",
                record_id: "cm-1",
                organization_id: "org-1",
                status: "committed",
                field_results: [{
                    provider_ref: "child.child_first_name",
                    canonical_ref: { entity_type: "customer_member", field_key: "first_name" },
                    old_value: "Samuel",
                    proposed_value: "Sam",
                    stale_state: "clean",
                    outcome: "updated",
                }],
                skipped_changes: [],
            },
        });
        expect(payload.processing_case_id).toBe("case-1");
        expect(payload.idempotency_key).toBe("ik1");
        expect(Array.isArray(payload.field_results)).toBe(true);
        expect(JSON.stringify(payload)).not.toContain("Samuel");
    });
});
