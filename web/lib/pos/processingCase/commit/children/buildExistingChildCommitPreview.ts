import type { RelatedRecordFieldDecisionKind } from "@/lib/intake/proposals/decisions";
import { decisionForProvider } from "@/lib/intake/proposals/decisions";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { buildExistingChildCommitPlan, type ExistingChildRecordSnapshot } from "@/lib/pos/processingCase/commit/children/planExistingChildCommit";
import type { ExistingChildCommitFieldState } from "@/lib/pos/processingCase/commit/children/types";
import { deriveRelatedRecordProposalReviewState } from "@/lib/pos/processingCase/commit/proposalState";
import type { StoredProposalCommitResult, StoredProposalDecision } from "@/lib/pos/processingCase/commit/proposalMetadata";
import { resolveMutationCapability, validateMutationValue } from "@/lib/fields/mutation/resolveMutationCapability";

export type ExistingChildCommitPreviewFieldAction = "update" | "skip" | "block";

export type ExistingChildCommitPreviewField = {
    provider_ref: string;
    label: string;
    current_value: unknown;
    proposed_value: unknown;
    decision: RelatedRecordFieldDecisionKind;
    eligible: boolean;
    stale_state: ExistingChildCommitFieldState | null;
    validation_error?: string;
    action: ExistingChildCommitPreviewFieldAction;
    reason?: string;
    canonical_field_key?: string;
};

export type ExistingChildCommitPreview = {
    proposal_id: string;
    record_id: string;
    review_state: ReturnType<typeof deriveRelatedRecordProposalReviewState>;
    can_commit: boolean;
    fields: ExistingChildCommitPreviewField[];
    approved_changes: ReturnType<typeof buildExistingChildCommitPlan>["approved_changes"];
    skipped_changes: ReturnType<typeof buildExistingChildCommitPlan>["skipped_changes"];
};

function previewActionFromPlan(args: {
    decision: RelatedRecordFieldDecisionKind;
    eligibleBase: boolean;
    validationError?: string;
    approved?: { stale_state: ExistingChildCommitFieldState; canonical_ref: { field_key: string } };
    skipped?: { outcome: string; reason: string };
}): Pick<ExistingChildCommitPreviewField, "action" | "reason" | "canonical_field_key" | "stale_state" | "eligible"> {
    if (args.skipped?.outcome === "stale_conflict") {
        return { action: "block", reason: args.skipped.reason, stale_state: "stale_conflict", eligible: false };
    }
    if (args.validationError) {
        return { action: "block", reason: args.validationError, stale_state: null, eligible: false };
    }
    if (args.decision === "reject" || args.decision === "defer") {
        return { action: "skip", reason: args.skipped?.reason ?? `${args.decision} by operator`, stale_state: null, eligible: false };
    }
    if (args.approved && args.approved.stale_state === "clean") {
        return {
            action: "update",
            canonical_field_key: args.approved.canonical_ref.field_key,
            stale_state: "clean",
            eligible: true,
        };
    }
    if (args.skipped) {
        const block = args.skipped.outcome === "unauthorized" || args.skipped.outcome === "invalid" || args.skipped.outcome === "failed";
        return {
            action: block ? "block" : "skip",
            reason: args.skipped.reason,
            stale_state: args.skipped.outcome === "stale_conflict" ? "stale_conflict" : null,
            eligible: false,
        };
    }
    if (!args.eligibleBase) {
        return { action: "block", reason: "Proposal is not eligible for existing-child commit.", stale_state: null, eligible: false };
    }
    return { action: "skip", reason: "No executable change.", stale_state: null, eligible: false };
}

export function buildExistingChildCommitPreview(args: {
    proposal: RelatedRecordInstanceProposal;
    decision: RelatedRecordProposalDecision;
    currentRecord: ExistingChildRecordSnapshot | null;
    orgId: string;
    expectedCustomerId: string | null;
    storedDecision?: StoredProposalDecision | null;
    storedResult?: StoredProposalCommitResult | null;
}): ExistingChildCommitPreview {
    const plan = buildExistingChildCommitPlan({
        proposal: args.proposal,
        decision: args.decision,
        currentRecord: args.currentRecord,
        orgId: args.orgId,
        expectedCustomerId: args.expectedCustomerId,
    });
    const eligibleBase = !plan.skipped_changes.some((s) => s.provider_ref === "*");
    const review_state = deriveRelatedRecordProposalReviewState({
        decision: args.storedDecision ?? null,
        commitResult: args.storedResult ?? null,
        plan,
    });
    const can_commit = plan.approved_changes.some((c) => c.stale_state === "clean");

    const fields: ExistingChildCommitPreviewField[] = args.proposal.field_proposals.map((field) => {
        const decision = decisionForProvider(args.decision, field.provider_ref);
        const capability = resolveMutationCapability(field.provider_ref);
        const normalized = capability ? validateMutationValue(capability, field.submitted_value) : null;
        const validation_error = normalized && !normalized.ok ? normalized.reason : undefined;
        const current_value = capability && args.currentRecord ? args.currentRecord.profile[capability.field_key] : null;
        const approved = plan.approved_changes.find((c) => c.provider_ref === field.provider_ref);
        const skipped = plan.skipped_changes.find((s) => s.provider_ref === field.provider_ref);
        const actionBits = previewActionFromPlan({
            decision,
            eligibleBase,
            validationError: validation_error,
            approved,
            skipped,
        });
        return {
            provider_ref: field.provider_ref,
            label: field.label ?? field.provider_ref,
            current_value,
            proposed_value: field.submitted_value,
            decision,
            validation_error,
            ...actionBits,
        };
    });

    return {
        proposal_id: plan.proposal_id,
        record_id: plan.record_id,
        review_state,
        can_commit,
        fields,
        approved_changes: plan.approved_changes,
        skipped_changes: plan.skipped_changes,
    };
}
