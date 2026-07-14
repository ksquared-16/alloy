/**
 * Processing Identity Resolution — D2 Commit Executor types + ports.
 *
 * The executor consumes an APPROVED, immutable plan and invokes registered
 * semantic commands. It never reinterprets the plan, never changes a target, and
 * is reachable only from a trusted server-side Processing service (no source
 * ingestion path, no feature flag). Its safety boundary:
 *   no valid approval → no execution; no direct source integration → no auto-exec.
 */

import type { CommandResult } from "../commands/commandContracts";
import type { CommitPlan, PlanApproval, PlanOperation } from "../plan/planTypes";

export type OperationStatus =
    | "committed"
    | "failed"
    | "skipped"
    | "compensated"
    | "async_failed";

export type OperationResult = {
    opId: string;
    commandKey: string;
    status: OperationStatus;
    recordId: string | null;
    idempotentReplay: boolean;
    error: string | null;
};

export type CompensationResult = {
    opId: string;
    action: "flagged_for_operator" | "reversed" | "none";
    status: "recorded" | "failed";
    detail: string;
};

export type AttemptOutcome =
    | "committed"
    | "partially_committed"
    | "failed"
    | "preflight_rejected";

export type CommitAttempt = {
    attemptId: string;
    orgId: string;
    caseId: string;
    planId: string;
    planVersion: number;
    planContentHash: string;
    attemptNo: number;
    executionIdempotencyKey: string;
    actorId: string;
    outcome: AttemptOutcome;
    operations: OperationResult[];
    compensation: CompensationResult[];
    events: string[];
    preflightFailures: string[];
    startedAt: string;
    finishedAt: string;
};

/**
 * Atomic identity-group runner: executes the identity group operations in ONE
 * database transaction (person + household + links + child). Production wires
 * this to the `execute_processing_identity_group` RPC; tests inject an
 * all-or-nothing in-memory fake. Returns the ref (opId) → created record-id map.
 */
export interface AtomicGroupRunner {
    run(input: {
        orgId: string;
        actorId: string;
        idempotencyKey: string;
        operations: {
            opId: string;
            commandKey: string;
            payload: Record<string, unknown>;
        }[];
    }): Promise<
        | { ok: true; refs: Record<string, string> }
        | { ok: false; error: string; refs?: Record<string, string> }
    >;
}

/**
 * Executes a single dependent/async operation via the D0 registry. The impl owns
 * its own supabase + command ports; the executor supplies only the semantic envelope.
 */
export interface CommandExecutor {
    execute(
        commandKey: string,
        payload: Record<string, unknown>,
        opts: { orgId: string; actorId: string; idempotencyKey: string },
    ): Promise<CommandResult>;
}

/** Compensation port: reversible ops may compensate; creation is never hard-deleted. */
export interface CompensationPort {
    compensate(input: {
        op: PlanOperation;
        recordId: string | null;
        context: { orgId: string; caseId: string; actorId: string };
    }): Promise<CompensationResult>;
}

export type ExecutorPorts = {
    atomicGroup: AtomicGroupRunner;
    command: CommandExecutor;
    compensation: CompensationPort;
};

export type ExecuteApprovedPlanInput = {
    plan: CommitPlan;
    approval: PlanApproval | null;
    context: {
        orgId: string;
        actorId: string;
        /** Server-revalidated permission at execution time. */
        actorAuthorized: boolean;
    };
    executionIdempotencyKey: string;
    /** Current record versions for optimistic-concurrency preflight. */
    currentRecordVersions?: Record<string, string>;
    /** Unresolved blocking conflicts (fail closed if present). */
    blockingConflicts?: string[];
    /** Prior attempt for safe retry/resume (skip already-committed ops). */
    priorAttempt?: CommitAttempt | null;
    /** Deterministic clock for tests. */
    now?: () => string;
};
