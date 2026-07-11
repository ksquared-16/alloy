import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import type { ExistingChildCommitResult } from "@/lib/pos/processingCase/commit/children/types";

export type StoredProposalDecision = RelatedRecordProposalDecision & {
    decided_at: string;
    decided_by: string;
    decision_version: string;
};

export type StoredProposalCommitResult = ExistingChildCommitResult & {
    committed_at: string;
    committed_by: string;
    decision_version: string;
    idempotency_key: string;
    audit_event_id?: string | null;
};

export type ProposalCommitLock = {
    idempotency_key: string;
    locked_at: string;
    locked_by: string;
};

export type RelatedRecordProposalCommitMetadata = {
    decisions?: Record<string, StoredProposalDecision>;
    commit_results?: Record<string, StoredProposalCommitResult>;
    commit_locks?: Record<string, ProposalCommitLock>;
};

export function processingProposalMetadata(meta: unknown): RelatedRecordProposalCommitMetadata {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    const raw = (meta as Record<string, unknown>).related_record_proposals;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as RelatedRecordProposalCommitMetadata;
}

function mergeProposalSection<T extends Record<string, unknown>>(
    current: RelatedRecordProposalCommitMetadata,
    key: keyof RelatedRecordProposalCommitMetadata,
    proposalId: string,
    value: T,
): RelatedRecordProposalCommitMetadata {
    const section = { ...(current[key] as Record<string, T> | undefined ?? {}), [proposalId]: value };
    return { ...current, [key]: section };
}

export function mergeProposalDecisionMetadata(args: {
    metadata: Record<string, unknown>;
    proposalId: string;
    decision: RelatedRecordProposalDecision;
    decisionVersion: string;
    userId: string;
    now: string;
}): Record<string, unknown> {
    const current = processingProposalMetadata(args.metadata);
    const stored: StoredProposalDecision = {
        ...args.decision,
        decided_at: args.now,
        decided_by: args.userId,
        decision_version: args.decisionVersion,
    };
    const next = mergeProposalSection(current, "decisions", args.proposalId, stored);
    return { ...args.metadata, related_record_proposals: next };
}

export function mergeProposalCommitResultMetadata(args: {
    metadata: Record<string, unknown>;
    proposalId: string;
    result: ExistingChildCommitResult;
    decisionVersion: string;
    idempotencyKey: string;
    userId: string;
    now: string;
    auditEventId?: string | null;
}): Record<string, unknown> {
    const current = processingProposalMetadata(args.metadata);
    const stored: StoredProposalCommitResult = {
        ...args.result,
        committed_at: args.now,
        committed_by: args.userId,
        decision_version: args.decisionVersion,
        idempotency_key: args.idempotencyKey,
        audit_event_id: args.auditEventId ?? null,
    };
    const withoutLock = { ...current, commit_locks: { ...(current.commit_locks ?? {}) } };
    delete withoutLock.commit_locks![args.proposalId];
    const next = mergeProposalSection(withoutLock, "commit_results", args.proposalId, stored);
    return { ...args.metadata, related_record_proposals: next };
}

export function mergeProposalCommitLockMetadata(args: {
    metadata: Record<string, unknown>;
    proposalId: string;
    lock: ProposalCommitLock;
}): Record<string, unknown> {
    const current = processingProposalMetadata(args.metadata);
    const next = mergeProposalSection(current, "commit_locks", args.proposalId, args.lock);
    return { ...args.metadata, related_record_proposals: next };
}

export function clearProposalCommitLockMetadata(args: {
    metadata: Record<string, unknown>;
    proposalId: string;
}): Record<string, unknown> {
    const current = processingProposalMetadata(args.metadata);
    const locks = { ...(current.commit_locks ?? {}) };
    delete locks[args.proposalId];
    return {
        ...args.metadata,
        related_record_proposals: { ...current, commit_locks: Object.keys(locks).length ? locks : undefined },
    };
}

const LOCK_TTL_MS = 120_000;

export function isFreshCommitLock(lock: ProposalCommitLock | undefined, nowMs: number = Date.now()): boolean {
    if (!lock) return false;
    const at = Date.parse(lock.locked_at);
    if (Number.isNaN(at)) return false;
    return nowMs - at < LOCK_TTL_MS;
}

export function findIdempotentCommitResult(
    metadata: unknown,
    proposalId: string,
    idempotencyKey: string,
): StoredProposalCommitResult | null {
    const stored = processingProposalMetadata(metadata).commit_results?.[proposalId];
    if (!stored) return null;
    if (stored.idempotency_key !== idempotencyKey) return null;
    if (stored.status === "committed" || stored.status === "partial" || stored.status === "blocked" || stored.status === "noop") {
        return stored;
    }
    return null;
}
