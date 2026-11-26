import { createHash } from "node:crypto";
import { normalizeProposalDecision, type RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";

export function computeDecisionVersion(decision: RelatedRecordProposalDecision): string {
    const normalized = normalizeProposalDecision(decision);
    const body = JSON.stringify({
        proposal_id: normalized.proposal_id,
        instance_decision: normalized.instance_decision ?? null,
        field_decisions: normalized.field_decisions.map((f) => [f.provider_ref, f.decision]),
    });
    return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 32);
}

export function computeCommitIdempotencyKey(proposalId: string, decisionVersion: string): string {
    return createHash("sha256").update(`${proposalId}::${decisionVersion}`, "utf8").digest("hex").slice(0, 32);
}
