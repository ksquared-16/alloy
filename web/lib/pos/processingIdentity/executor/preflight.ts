/**
 * Commit executor preflight (D2 §23).
 *
 * Fail-closed validation before any write. A failure returns a durable
 * review/exception result; the plan is NEVER silently regenerated or reinterpreted.
 */

import { getCommandMetadata } from "../commands/registry";
import { validateApprovalForExecution } from "../plan/approval";
import type { CommitPlan, PlanApproval } from "../plan/planTypes";

export type PreflightInput = {
    plan: CommitPlan;
    approval: PlanApproval | null;
    context: { orgId: string; actorId: string; actorAuthorized: boolean };
    executionIdempotencyKey: string;
    currentRecordVersions?: Record<string, string>;
    blockingConflicts?: string[];
};

export type PreflightResult = { ok: boolean; failures: string[] };

export function runPreflight(input: PreflightInput): PreflightResult {
    const failures: string[] = [];
    const { plan, approval, context } = input;

    if (!input.executionIdempotencyKey?.trim()) failures.push("missing_execution_idempotency_key");
    if (plan.orgId !== context.orgId) failures.push("tenant_mismatch");
    if (plan.supersededBy) failures.push("plan_superseded");

    // Exact approved plan + hash + version + actor authority.
    const approvalCheck = validateApprovalForExecution(approval, plan, {
        actorAuthorized: context.actorAuthorized,
    });
    if (!approvalCheck.valid) failures.push(approvalCheck.reason ?? "approval_invalid");

    if ((input.blockingConflicts ?? []).length > 0) failures.push("unresolved_blocking_conflict");

    const includedOps = plan.operations.filter((o) => o.included);
    if (includedOps.length === 0) failures.push("no_included_operations");

    // Every command key resolvable + not executable-in-V1 violations.
    for (const op of includedOps) {
        const md = getCommandMetadata(op.commandKey);
        if (!md) {
            failures.push(`unresolvable_command:${op.opId}`);
            continue;
        }
        if (!md.executableInV1) failures.push(`command_not_executable_in_v1:${op.opId}`);
    }

    // Required dependencies must be included.
    const includedIds = new Set(includedOps.map((o) => o.opId));
    for (const op of includedOps) {
        for (const dep of op.dependsOn) {
            if (!includedIds.has(dep)) failures.push(`required_dependency_excluded:${op.opId}->${dep}`);
        }
    }

    // Optimistic concurrency: expected record versions must still match.
    const versions = input.currentRecordVersions ?? {};
    for (const op of includedOps) {
        if (op.preconditionRecordVersion && op.targetId) {
            const current = versions[op.targetId];
            if (current !== undefined && current !== op.preconditionRecordVersion) {
                failures.push(`stale_record_version:${op.targetId}`);
            }
        }
    }

    return { ok: failures.length === 0, failures };
}
