/**
 * Deterministic Commit Executor (D2).
 *
 * Executes an approved plan through registered semantic commands:
 *   1. atomic identity group  → one DB transaction (person + household + links + child)
 *   2. dependent lifecycle    → sequenced; partial failure compensates + reopens
 *   3. asynchronous effects   → outbox (attach/comms); failure never rolls back identity
 *
 * Idempotent: a prior committed attempt with the same execution idempotency key is
 * returned as-is; a prior partial attempt resumes, skipping already-committed ops.
 * No feature flag; reachable only from a trusted server-side service.
 */

import type { PlanOperation } from "../plan/planTypes";
import { runPreflight } from "./preflight";
import { resolvePayload, type RefMap } from "./refResolution";
import type {
    CommitAttempt,
    CompensationResult,
    ExecuteApprovedPlanInput,
    ExecutorPorts,
    OperationResult,
} from "./executorTypes";

export async function executeApprovedPlan(
    input: ExecuteApprovedPlanInput,
    ports: ExecutorPorts,
): Promise<CommitAttempt> {
    const now = input.now ?? (() => new Date().toISOString());
    const startedAt = now();
    const { plan, context } = input;
    const attemptNo = (input.priorAttempt?.attemptNo ?? 0) + 1;

    const base: Omit<CommitAttempt, "outcome" | "operations" | "compensation" | "events" | "preflightFailures" | "finishedAt"> = {
        attemptId: `${plan.planId}:attempt:${attemptNo}`,
        orgId: plan.orgId,
        caseId: plan.caseId,
        planId: plan.planId,
        planVersion: plan.version,
        planContentHash: plan.contentHash,
        attemptNo,
        executionIdempotencyKey: input.executionIdempotencyKey,
        actorId: context.actorId,
        startedAt,
    };

    // ---- Idempotent replay: prior committed attempt with same key ----
    if (
        input.priorAttempt &&
        input.priorAttempt.executionIdempotencyKey === input.executionIdempotencyKey &&
        input.priorAttempt.outcome === "committed"
    ) {
        return input.priorAttempt;
    }

    // ---- Preflight (fail closed) ----
    const preflight = runPreflight({
        plan,
        approval: input.approval,
        context,
        executionIdempotencyKey: input.executionIdempotencyKey,
        currentRecordVersions: input.currentRecordVersions,
        blockingConflicts: input.blockingConflicts,
    });
    if (!preflight.ok) {
        return {
            ...base,
            outcome: "preflight_rejected",
            operations: [],
            compensation: [],
            events: [],
            preflightFailures: preflight.failures,
            finishedAt: now(),
        };
    }

    const includedOps = plan.operations.filter((o) => o.included).sort((a, b) => a.opOrder - b.opOrder);
    const refs: RefMap = {};
    const results: OperationResult[] = [];
    const compensation: CompensationResult[] = [];
    const events: string[] = [];

    // Seed refs from a prior partial attempt so retry resumes safely.
    const priorCommitted = new Map<string, OperationResult>();
    for (const r of input.priorAttempt?.operations ?? []) {
        if (r.status === "committed") {
            priorCommitted.set(r.opId, r);
            if (r.recordId) refs[r.opId] = r.recordId;
        }
    }

    const execOpts = {
        orgId: context.orgId,
        actorId: context.actorId,
        idempotencyKey: input.executionIdempotencyKey,
    };

    // ---- 1. Atomic identity group (one transaction) ----
    const atomicOps = includedOps.filter((o) => o.atomicGroup === "identity_core");
    const pendingAtomic = atomicOps.filter((o) => !priorCommitted.has(o.opId));
    if (pendingAtomic.length > 0) {
        const groupResult = await ports.atomicGroup.run({
            orgId: context.orgId,
            actorId: context.actorId,
            idempotencyKey: `${input.executionIdempotencyKey}:identity_core`,
            operations: pendingAtomic.map((o) => ({
                opId: o.opId,
                commandKey: o.commandKey,
                payload: resolvePayload(o.payload, refs),
            })),
        });
        if (!groupResult.ok) {
            // Whole group rolled back — nothing in the group committed.
            for (const o of atomicOps) {
                results.push(opResult(o, "failed", null, false, groupResult.error));
            }
            return finalize(base, "failed", results, compensation, events, now());
        }
        for (const o of pendingAtomic) {
            const recordId = groupResult.refs[o.opId] ?? null;
            refs[o.opId] = recordId ?? "";
            results.push(opResult(o, "committed", recordId, false, null));
            events.push(`${o.commandKey}:committed`);
        }
    }
    // carry prior-committed atomic ops into results as skipped (already done)
    for (const o of atomicOps.filter((x) => priorCommitted.has(x.opId))) {
        results.push(opResult(o, "skipped", refs[o.opId] ?? null, true, null));
    }

    // ---- 2. Dependent lifecycle ops (sequenced; compensate on failure) ----
    const dependentOps = includedOps.filter(
        (o) => o.atomicGroup !== "identity_core" && o.atomicity !== "asynchronous",
    );
    let partial = false;
    for (const op of dependentOps) {
        if (priorCommitted.has(op.opId)) {
            results.push(opResult(op, "skipped", refs[op.opId] ?? null, true, null));
            continue;
        }
        if (op.opKind === "no_op") {
            results.push(opResult(op, "committed", op.targetId, false, null));
            continue;
        }
        const payload = resolvePayload(op.payload, refs);
        const res = await ports.command.execute(op.commandKey, payload, execOpts);
        if (!res.ok) {
            results.push(opResult(op, "failed", null, false, res.error ?? "command_failed"));
            partial = true;
            // Compensate reversible dependent ops already committed in this attempt.
            for (const done of results.filter((r) => r.status === "committed")) {
                const doneOp = includedOps.find((o) => o.opId === done.opId);
                if (doneOp && doneOp.reversibility !== "irreversible" && doneOp.atomicGroup !== "identity_core") {
                    compensation.push(
                        await ports.compensation.compensate({
                            op: doneOp,
                            recordId: done.recordId,
                            context: { orgId: context.orgId, caseId: plan.caseId, actorId: context.actorId },
                        }),
                    );
                }
            }
            return finalize(base, "partially_committed", results, compensation, events, now());
        }
        const recordId = res.refs[0]?.recordId ?? op.targetId ?? null;
        if (recordId) refs[op.opId] = recordId;
        results.push(opResult(op, "committed", recordId, res.idempotentReplay, null));
        events.push(`${op.commandKey}:committed`);
    }

    // ---- 3. Asynchronous outbox effects (never roll back identity) ----
    const asyncOps = includedOps.filter((o) => o.atomicity === "asynchronous");
    for (const op of asyncOps) {
        if (priorCommitted.has(op.opId)) {
            results.push(opResult(op, "skipped", refs[op.opId] ?? null, true, null));
            continue;
        }
        const payload = resolvePayload(op.payload, refs);
        const res = await ports.command.execute(op.commandKey, payload, execOpts);
        if (!res.ok) {
            // Async failure is recorded but identity is NOT rolled back.
            results.push(opResult(op, "async_failed", null, false, res.error ?? "async_failed"));
            events.push(`${op.commandKey}:async_failed`);
            partial = true;
            continue;
        }
        results.push(opResult(op, "committed", res.refs[0]?.recordId ?? null, res.idempotentReplay, null));
        events.push(`${op.commandKey}:committed`);
    }

    const outcome = partial ? "partially_committed" : "committed";
    return finalize(base, outcome, results, compensation, events, now());
}

function opResult(
    op: PlanOperation,
    status: OperationResult["status"],
    recordId: string | null,
    idempotentReplay: boolean,
    error: string | null,
): OperationResult {
    return { opId: op.opId, commandKey: op.commandKey, status, recordId, idempotentReplay, error };
}

function finalize(
    base: Omit<CommitAttempt, "outcome" | "operations" | "compensation" | "events" | "preflightFailures" | "finishedAt">,
    outcome: CommitAttempt["outcome"],
    operations: OperationResult[],
    compensation: CompensationResult[],
    events: string[],
    finishedAt: string,
): CommitAttempt {
    return { ...base, outcome, operations, compensation, events, preflightFailures: [], finishedAt };
}
