import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalCaseContext } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import type { ExistingChildRecordSnapshot } from "@/lib/pos/processingCase/commit/children/planExistingChildCommit";

export type ExistingChildCommitAuthorizationFailure = {
    ok: false;
    status: 403 | 404;
    reason: string;
};

export type ExistingChildCommitAuthorizationSuccess = {
    ok: true;
    proposal: RelatedRecordInstanceProposal;
    currentRecord: ExistingChildRecordSnapshot;
    context: RelatedRecordProposalCaseContext;
};

export function verifyExistingChildCommitAuthorization(args: {
    orgId: string;
    caseId: string;
    proposalId: string;
    proposalContext: RelatedRecordProposalCaseContext | null;
    currentRecord: ExistingChildRecordSnapshot | null;
}): ExistingChildCommitAuthorizationSuccess | ExistingChildCommitAuthorizationFailure {
    if (!args.proposalContext) {
        return { ok: false, status: 404, reason: "Proposal not found for case" };
    }
    if (args.proposalContext.proposal.proposal_id !== args.proposalId) {
        return { ok: false, status: 404, reason: "Proposal identity mismatch" };
    }
    const proposal = args.proposalContext.proposal;
    if (proposal.origin !== "existing_record") {
        return { ok: false, status: 403, reason: "Only existing child proposals may commit in P5B" };
    }
    if (proposal.collection_provider_ref !== "children") {
        return { ok: false, status: 403, reason: "Only children collection proposals may commit in P5B" };
    }
    if (proposal.item_entity_type !== "customer_member") {
        return { ok: false, status: 403, reason: "Only customer_member proposals may commit in P5B" };
    }
    if (proposal.status !== "valid") {
        return { ok: false, status: 403, reason: "Proposal is not valid" };
    }
    if (!proposal.existing_record_id) {
        return { ok: false, status: 403, reason: "Missing existing child record id" };
    }
    if (!args.currentRecord) {
        return { ok: false, status: 404, reason: "Current child record was not found" };
    }
    if (args.currentRecord.org_id !== args.orgId) {
        return { ok: false, status: 403, reason: "Child record belongs to a different organization" };
    }
    if (args.proposalContext.expectedCustomerId && args.currentRecord.customer_id !== args.proposalContext.expectedCustomerId) {
        return { ok: false, status: 403, reason: "Child record belongs to a different household" };
    }
    return {
        ok: true,
        proposal,
        currentRecord: args.currentRecord,
        context: args.proposalContext,
    };
}
