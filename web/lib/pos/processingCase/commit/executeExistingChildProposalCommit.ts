import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { computeCommitIdempotencyKey, computeDecisionVersion } from "@/lib/intake/proposals/decisionVersion";
import { buildExistingChildCommitPreview } from "@/lib/pos/processingCase/commit/children/buildExistingChildCommitPreview";
import { executeExistingChildCommitPlan } from "@/lib/pos/processingCase/commit/children/executeExistingChildCommit";
import type { ExistingChildRecordSnapshot } from "@/lib/pos/processingCase/commit/children/planExistingChildCommit";
import { customerMemberNativeSnapshotSelectColumns, nativeProfileValuesFromRecord } from "@/lib/fields/mutation/resolveMutationCapability";
import { buildExistingChildCommitAuditPayload } from "@/lib/pos/processingCase/commit/auditExistingChildCommit";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    clearProposalCommitLockMetadata,
    findIdempotentCommitResult,
    isFreshCommitLock,
    mergeProposalCommitLockMetadata,
    mergeProposalCommitResultMetadata,
    mergeProposalDecisionMetadata,
    processingProposalMetadata,
} from "@/lib/pos/processingCase/commit/proposalMetadata";
import { verifyExistingChildCommitAuthorization } from "@/lib/pos/processingCase/commit/verifyExistingChildCommitAuthorization";
import { emitEvent } from "@/lib/emitEvent";

export type ExistingChildProposalRequestBase = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    caseId: string;
    proposalId: string;
    decision: RelatedRecordProposalDecision;
    metadata: Record<string, unknown>;
};

export type ExistingChildProposalPreviewRequest = ExistingChildProposalRequestBase;

export type ExistingChildProposalCommitRequest = ExistingChildProposalRequestBase & {
    now?: string;
};

export type ExistingChildProposalPreviewResponse = {
    ok: true;
    preview: ReturnType<typeof buildExistingChildCommitPreview>;
    idempotency_key: string;
    decision_version: string;
    alreadyDone?: boolean;
    stored_result?: ReturnType<typeof findIdempotentCommitResult>;
};

export type ExistingChildProposalCommitResponse = ExistingChildProposalPreviewResponse & {
    result: NonNullable<ExistingChildProposalPreviewResponse["stored_result"]> | Awaited<ReturnType<typeof executeExistingChildCommitPlan>>;
    audit_event_id?: string | null;
};

export type ExistingChildProposalFailure = {
    ok: false;
    status: 403 | 404 | 409 | 500;
    error: string;
};

async function loadChildRecord(
    supabase: SupabaseClient,
    orgId: string,
    recordId: string | undefined,
): Promise<ExistingChildRecordSnapshot | null> {
    if (!recordId) return null;
    const { data, error } = await supabase
        .from("customer_members")
        .select(customerMemberNativeSnapshotSelectColumns())
        .eq("org_id", orgId)
        .eq("id", recordId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as Record<string, unknown>;
    return {
        id: String(row.id ?? ""),
        org_id: String(row.org_id ?? ""),
        customer_id: String(row.customer_id ?? ""),
        profile: nativeProfileValuesFromRecord(row),
    };
}

export async function previewExistingChildProposalCommit(
    args: ExistingChildProposalPreviewRequest,
): Promise<ExistingChildProposalPreviewResponse | ExistingChildProposalFailure> {
    const decisionVersion = computeDecisionVersion(args.decision);
    const idempotencyKey = computeCommitIdempotencyKey(args.proposalId, decisionVersion);
    const stored = findIdempotentCommitResult(args.metadata, args.proposalId, idempotencyKey);
    const proposalContext = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });
    const currentRecord = await loadChildRecord(args.supabase, args.orgId, proposalContext?.proposal.existing_record_id);
    const auth = verifyExistingChildCommitAuthorization({
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
        proposalContext,
        currentRecord,
    });
    if (!auth.ok) return { ok: false, status: auth.status, error: auth.reason };

    const meta = processingProposalMetadata(args.metadata);
    const preview = buildExistingChildCommitPreview({
        proposal: auth.proposal,
        decision: args.decision,
        currentRecord: auth.currentRecord,
        orgId: args.orgId,
        expectedCustomerId: auth.context.expectedCustomerId,
        storedDecision: meta.decisions?.[args.proposalId] ?? null,
        storedResult: stored,
    });

    return {
        ok: true,
        preview,
        idempotency_key: idempotencyKey,
        decision_version: decisionVersion,
        ...(stored ? { alreadyDone: true, stored_result: stored } : {}),
    };
}

export async function executeExistingChildProposalCommit(
    args: ExistingChildProposalCommitRequest,
): Promise<ExistingChildProposalCommitResponse | ExistingChildProposalFailure> {
    const now = args.now ?? new Date().toISOString();
    const previewResult = await previewExistingChildProposalCommit(args);
    if (!previewResult.ok) return previewResult;
    if (previewResult.alreadyDone && previewResult.stored_result) {
        return {
            ...previewResult,
            result: previewResult.stored_result,
            audit_event_id: previewResult.stored_result.audit_event_id ?? null,
        };
    }
    if (!previewResult.preview.can_commit) {
        return { ok: false, status: 409, error: "No clean approved fields are eligible to commit." };
    }

    const decisionVersion = previewResult.decision_version;
    const idempotencyKey = previewResult.idempotency_key;
    const lock = processingProposalMetadata(args.metadata).commit_locks?.[args.proposalId];
    if (isFreshCommitLock(lock) && lock!.idempotency_key !== idempotencyKey) {
        return { ok: false, status: 409, error: "Another commit is in progress for this proposal." };
    }

    const withDecision = mergeProposalDecisionMetadata({
        metadata: args.metadata,
        proposalId: args.proposalId,
        decision: args.decision,
        decisionVersion,
        userId: args.userId,
        now,
    });
    const withLock = mergeProposalCommitLockMetadata({
        metadata: withDecision,
        proposalId: args.proposalId,
        lock: { idempotency_key: idempotencyKey, locked_at: now, locked_by: args.userId },
    });

    const { error: lockError } = await args.supabase
        .from("processing_cases")
        .update({ metadata: withLock })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (lockError) throw new Error(lockError.message);

    const proposalContext = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });
    const currentRecord = await loadChildRecord(args.supabase, args.orgId, proposalContext?.proposal.existing_record_id);
    const auth = verifyExistingChildCommitAuthorization({
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
        proposalContext,
        currentRecord,
    });
    if (!auth.ok) {
        const cleared = clearProposalCommitLockMetadata({ metadata: withLock, proposalId: args.proposalId });
        await args.supabase.from("processing_cases").update({ metadata: cleared }).eq("org_id", args.orgId).eq("id", args.caseId);
        return { ok: false, status: auth.status, error: auth.reason };
    }

    const plan = {
        proposal_id: previewResult.preview.proposal_id,
        record_id: previewResult.preview.record_id,
        organization_id: args.orgId,
        customer_id: auth.currentRecord.customer_id,
        approved_changes: previewResult.preview.approved_changes,
        skipped_changes: previewResult.preview.skipped_changes,
    };
    const result = await executeExistingChildCommitPlan({ supabase: args.supabase, plan });

    let auditEventId: string | null = null;
    if (result.status === "committed" || result.status === "partial") {
        auditEventId = await emitEvent({
            org_id: args.orgId,
            event_type: "processing_related_record_proposal_committed",
            entity_type: "customer_member",
            entity_id: result.record_id || null,
            action_type: "processing_commit",
            occurred_at: now,
            payload: buildExistingChildCommitAuditPayload({
                org_id: args.orgId,
                processing_case_id: args.caseId,
                proposal_id: args.proposalId,
                decision: args.decision,
                decision_version: decisionVersion,
                idempotency_key: idempotencyKey,
                operator_id: args.userId,
                occurred_at: now,
                source: auth.context.source,
                result,
            }),
        });
    }

    const latestMeta = mergeProposalCommitResultMetadata({
        metadata: withLock,
        proposalId: args.proposalId,
        result,
        decisionVersion,
        idempotencyKey,
        userId: args.userId,
        now,
        auditEventId,
    });
    const { error: resultError } = await args.supabase
        .from("processing_cases")
        .update({ metadata: latestMeta })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (resultError) throw new Error(resultError.message);

    return {
        ok: true,
        preview: previewResult.preview,
        idempotency_key: idempotencyKey,
        decision_version: decisionVersion,
        result: { ...result, committed_at: now, committed_by: args.userId, decision_version: decisionVersion, idempotency_key: idempotencyKey, audit_event_id: auditEventId },
        audit_event_id: auditEventId,
    };
}
