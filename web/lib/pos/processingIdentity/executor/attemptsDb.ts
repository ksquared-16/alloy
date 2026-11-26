/**
 * Commit attempt + exception persistence (D2). Attempts are append-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommitAttempt } from "./executorTypes";

type Client = Pick<SupabaseClient, "from">;

export async function insertCommitAttempt(supabase: Client, attempt: CommitAttempt): Promise<string> {
    const { data, error } = await supabase
        .from("processing_commit_attempts")
        .insert({
            org_id: attempt.orgId,
            case_id: attempt.caseId,
            plan_id: attempt.planId,
            plan_version: attempt.planVersion,
            plan_content_hash: attempt.planContentHash,
            attempt_no: attempt.attemptNo,
            execution_idempotency_key: attempt.executionIdempotencyKey,
            actor_id: attempt.actorId,
            outcome: attempt.outcome,
            operations: attempt.operations,
            compensation: attempt.compensation,
            events: attempt.events,
            preflight_failures: attempt.preflightFailures,
            started_at: attempt.startedAt,
            finished_at: attempt.finishedAt,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "insert_commit_attempt_failed");
    return String((data as { id: string }).id);
}

export async function loadLatestAttemptForPlan(
    supabase: Client,
    args: { orgId: string; planId: string },
): Promise<CommitAttempt | null> {
    const { data } = await supabase
        .from("processing_commit_attempts")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("plan_id", args.planId)
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data) return null;
    return attemptFromRow(data as Record<string, unknown>);
}

export async function loadAttemptByIdempotencyKey(
    supabase: Client,
    args: { orgId: string; planId: string; executionIdempotencyKey: string },
): Promise<CommitAttempt | null> {
    const { data } = await supabase
        .from("processing_commit_attempts")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("plan_id", args.planId)
        .eq("execution_idempotency_key", args.executionIdempotencyKey)
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data) return null;
    return attemptFromRow(data as Record<string, unknown>);
}

function attemptFromRow(row: Record<string, unknown>): CommitAttempt {
    return {
        attemptId: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        planId: String(row.plan_id),
        planVersion: Number(row.plan_version),
        planContentHash: String(row.plan_content_hash),
        attemptNo: Number(row.attempt_no),
        executionIdempotencyKey: String(row.execution_idempotency_key),
        actorId: String(row.actor_id),
        outcome: row.outcome as CommitAttempt["outcome"],
        operations: (row.operations as CommitAttempt["operations"]) ?? [],
        compensation: (row.compensation as CommitAttempt["compensation"]) ?? [],
        events: (row.events as string[]) ?? [],
        preflightFailures: (row.preflight_failures as string[]) ?? [],
        startedAt: String(row.started_at),
        finishedAt: String(row.finished_at),
    };
}

export async function insertException(
    supabase: Client,
    args: {
        orgId: string;
        caseId: string;
        exceptionType: string;
        severity: string;
        code: string;
        message: string;
        subjectRef?: Record<string, unknown> | null;
        evidenceIds?: string[];
    },
): Promise<void> {
    await supabase.from("processing_exceptions").insert({
        org_id: args.orgId,
        case_id: args.caseId,
        exception_type: args.exceptionType,
        severity: args.severity,
        code: args.code,
        message: args.message,
        subject_ref: args.subjectRef ?? null,
        evidence_ids: args.evidenceIds ?? [],
    });
}
