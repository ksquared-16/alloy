import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { decisionForProvider } from "@/lib/intake/proposals/decisions";
import {
    nativeProfileValuesFromRecord,
    resolveMutationCapability,
    validateMutationValue,
} from "@/lib/fields/mutation/resolveMutationCapability";
import type {
    ExistingChildCommitFieldState,
    ExistingChildCommitPlan,
    ExistingChildSkippedChange,
} from "@/lib/pos/processingCase/commit/children/types";

export type ExistingChildRecordSnapshot = {
    id: string;
    org_id: string;
    customer_id: string;
    profile: Record<string, unknown>;
};

function sameValue(a: unknown, b: unknown): boolean {
    return String(a ?? "") === String(b ?? "");
}

function staleState(current: unknown, observed: unknown | undefined, proposed: unknown): ExistingChildCommitFieldState {
    if (sameValue(current, proposed)) return "already_applied";
    if (observed !== undefined && !sameValue(current, observed)) return "stale_conflict";
    return "clean";
}

function skip(provider_ref: string, reason: string, outcome: ExistingChildSkippedChange["outcome"]): ExistingChildSkippedChange {
    return { provider_ref, reason, outcome };
}

export function buildExistingChildCommitPlan(args: {
    proposal: RelatedRecordInstanceProposal;
    decision: RelatedRecordProposalDecision;
    currentRecord: ExistingChildRecordSnapshot | null;
    orgId: string;
    expectedCustomerId: string | null;
}): ExistingChildCommitPlan {
    const skipped: ExistingChildSkippedChange[] = [];
    const proposal = args.proposal;
    const recordId = proposal.existing_record_id ?? "";
    const customerId = args.currentRecord?.customer_id ?? args.expectedCustomerId ?? "";

    const base: ExistingChildCommitPlan = {
        proposal_id: proposal.proposal_id,
        record_id: recordId,
        organization_id: args.orgId,
        customer_id: customerId,
        approved_changes: [],
        skipped_changes: skipped,
    };

    if (proposal.origin !== "existing_record") skipped.push(skip("*", "Only existing records can be committed in P5B.", "unsupported"));
    if (proposal.collection_provider_ref !== "children") skipped.push(skip("*", "Only Children proposals can be committed in P5B.", "unsupported"));
    if (proposal.item_entity_type !== "customer_member") skipped.push(skip("*", "Only customer_member proposals can be committed in P5B.", "unsupported"));
    if (!recordId) skipped.push(skip("*", "Existing child proposal is missing existing_record_id.", "invalid"));
    if (proposal.status !== "valid") skipped.push(skip("*", "Only valid proposals can be committed.", "invalid"));
    if (!args.currentRecord) skipped.push(skip("*", "Current child record was not found.", "invalid"));
    if (args.currentRecord && args.currentRecord.org_id !== args.orgId) skipped.push(skip("*", "Current child record belongs to a different organization.", "unauthorized"));
    if (args.currentRecord && args.expectedCustomerId && args.currentRecord.customer_id !== args.expectedCustomerId) {
        skipped.push(skip("*", "Current child record belongs to a different household.", "unauthorized"));
    }

    if (skipped.some((s) => s.provider_ref === "*")) return base;

    const profile = args.currentRecord!.profile;

    for (const field of proposal.field_proposals) {
        const fieldDecision = decisionForProvider(args.decision, field.provider_ref);
        if (fieldDecision === "reject") {
            skipped.push(skip(field.provider_ref, "Field was rejected by operator.", "rejected"));
            continue;
        }
        if (fieldDecision === "defer") {
            skipped.push(skip(field.provider_ref, "Field was deferred by operator.", "deferred"));
            continue;
        }

        const capability = resolveMutationCapability(field.provider_ref);
        if (!capability) {
            skipped.push(skip(field.provider_ref, "Field is not writable through the canonical mutation platform.", "unsupported"));
            continue;
        }
        const normalized = validateMutationValue(capability, field.submitted_value);
        if (!normalized.ok) {
            skipped.push(skip(field.provider_ref, normalized.reason, "invalid"));
            continue;
        }
        const current = profile[capability.field_key];
        const state = staleState(current, field.observed_value, normalized.value);
        if (state === "already_applied") {
            skipped.push(skip(field.provider_ref, "Proposed value is already applied.", "unchanged"));
            continue;
        }
        if (state === "stale_conflict") {
            skipped.push(skip(field.provider_ref, "Current value changed since proposal was formed.", "stale_conflict"));
            continue;
        }
        base.approved_changes.push({
            provider_ref: field.provider_ref,
            canonical_ref: capability.canonical_ref,
            old_value: current,
            proposed_value: normalized.value,
            stale_state: state,
        });
    }

    base.approved_changes.sort((a, b) => a.provider_ref.localeCompare(b.provider_ref));
    base.skipped_changes.sort((a, b) => a.provider_ref.localeCompare(b.provider_ref));
    return base;
}
