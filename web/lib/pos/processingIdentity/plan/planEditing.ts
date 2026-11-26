/**
 * Commit Plan editing + versioning (D1).
 *
 * Plans are immutable once built. Operator edits (include/exclude, value edits,
 * target changes, added ops) do not mutate a plan — they produce a NEW version.
 * A material change (different content hash) invalidates the prior approval.
 */

import { buildCommitPlan, type PlanOperationInput } from "./buildCommitPlan";
import type { CommitPlan } from "./planTypes";

export type InclusionIssue = { code: string; message: string; opId: string };

/** Reconstruct editable inputs from a built plan (round-trip preserves content). */
export function planToOperationInputs(plan: CommitPlan): PlanOperationInput[] {
    return plan.operations.map((op) => ({
        ref: op.opId,
        opKind: op.opKind,
        commandKey: op.commandKey,
        targetId: op.targetId,
        payload: op.payload,
        before: op.before,
        after: op.after,
        reason: op.reason,
        evidenceRefs: op.evidenceRefs,
        resolutionRefs: op.resolutionRefs,
        risk: op.risk,
        dependsOnRefs: op.dependsOn,
        optional: op.optional,
        included: op.included,
        preconditionRecordVersion: op.preconditionRecordVersion,
    }));
}

/**
 * Validate an include/exclude configuration:
 *  - a required (non-optional) op may not be excluded;
 *  - an included op may not depend on an excluded op.
 */
export function validatePlanInclusion(inputs: PlanOperationInput[]): {
    ok: boolean;
    issues: InclusionIssue[];
} {
    const issues: InclusionIssue[] = [];
    const includedRefs = new Set(inputs.filter((o) => o.included !== false).map((o) => o.ref));

    for (const op of inputs) {
        const included = op.included !== false;
        if (!included && op.optional !== true) {
            issues.push({
                code: "cannot_exclude_required",
                message: `Operation "${op.ref}" is required and cannot be excluded`,
                opId: op.ref,
            });
        }
        if (included) {
            for (const dep of op.dependsOnRefs ?? []) {
                if (!includedRefs.has(dep)) {
                    issues.push({
                        code: "required_dependency_excluded",
                        message: `Included operation "${op.ref}" depends on excluded operation "${dep}"`,
                        opId: op.ref,
                    });
                }
            }
        }
    }
    return { ok: issues.length === 0, issues };
}

export type RevisePlanResult = {
    plan: CommitPlan;
    /** True when the revision changed executable content (voids prior approval). */
    material: boolean;
};

/**
 * Produce the next plan version from operator-edited inputs. The prior plan is
 * left immutable; the returned plan carries version = previous + 1 and, when the
 * change is material, must supersede the previous (DB writes the pointer).
 */
export function revisePlan(
    previous: CommitPlan,
    nextOperations: PlanOperationInput[],
    opts: { sourceResolutionVersions?: string[]; builtAt?: string } = {},
): RevisePlanResult {
    const plan = buildCommitPlan({
        orgId: previous.orgId,
        caseId: previous.caseId,
        planId: `${previous.caseId}:v${previous.version + 1}`,
        version: previous.version + 1,
        operations: nextOperations,
        sourceResolutionVersions: opts.sourceResolutionVersions ?? previous.sourceResolutionVersions,
        builtAt: opts.builtAt,
    });
    return { plan, material: plan.contentHash !== previous.contentHash };
}

/** Toggle a single operation's inclusion, returning the next editable inputs. */
export function toggleInclusion(
    inputs: PlanOperationInput[],
    opId: string,
    included: boolean,
): PlanOperationInput[] {
    return inputs.map((op) => (op.ref === opId ? { ...op, included } : op));
}
