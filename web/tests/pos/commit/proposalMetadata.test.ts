import { describe, expect, it } from "vitest";
import {
    findIdempotentCommitResult,
    isFreshCommitLock,
    mergeProposalCommitResultMetadata,
    mergeProposalDecisionMetadata,
    processingProposalMetadata,
} from "@/lib/pos/processingCase/commit/proposalMetadata";

describe("proposalMetadata", () => {
    it("preserves sibling proposal entries", () => {
        const metadata = {
            related_record_proposals: {
                decisions: { other: { proposal_id: "other", field_decisions: [], decided_at: "t", decided_by: "u", decision_version: "v" } },
            },
        };
        const next = mergeProposalDecisionMetadata({
            metadata,
            proposalId: "p1",
            decision: { proposal_id: "p1", field_decisions: [] },
            decisionVersion: "dv1",
            userId: "u1",
            now: "now",
        });
        const parsed = processingProposalMetadata(next);
        expect(parsed.decisions?.other).toBeTruthy();
        expect(parsed.decisions?.p1?.decision_version).toBe("dv1");
    });

    it("returns idempotent stored results by key", () => {
        const metadata = mergeProposalCommitResultMetadata({
            metadata: {},
            proposalId: "p1",
            result: { proposal_id: "p1", record_id: "cm-1", organization_id: "org-1", status: "committed", field_results: [], skipped_changes: [] },
            decisionVersion: "dv1",
            idempotencyKey: "ik1",
            userId: "u1",
            now: "now",
            auditEventId: "evt-1",
        });
        expect(findIdempotentCommitResult(metadata, "p1", "ik1")?.audit_event_id).toBe("evt-1");
        expect(findIdempotentCommitResult(metadata, "p1", "other")).toBeNull();
    });

    it("treats fresh commit locks as active", () => {
        expect(isFreshCommitLock({ idempotency_key: "ik", locked_at: new Date().toISOString(), locked_by: "u" })).toBe(true);
        expect(isFreshCommitLock({ idempotency_key: "ik", locked_at: new Date(Date.now() - 300_000).toISOString(), locked_by: "u" })).toBe(false);
    });
});
