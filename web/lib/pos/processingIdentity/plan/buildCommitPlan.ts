/**
 * Deterministic Commit Plan builder (D1).
 *
 * Turns a recommendation set (registered-command operations) into a versioned,
 * content-hashed, immutable plan with dependency ordering and atomic groups.
 * Deterministic: identical input → identical plan (same op order + hash).
 */

import { getCommandMetadata } from "../commands/registry";
import { isForbiddenCommandKey } from "../commands/commandKeys";
import { computePlanContentHash } from "./planHash";
import type {
    CommitPlan,
    OperationRisk,
    PlanDiffEntry,
    PlanDiffView,
    PlanOperation,
    PlanOperationKind,
    PlanPrecondition,
} from "./planTypes";

/** One recommended operation (from the D3 recommendation builder). */
export type PlanOperationInput = {
    /** Unique local ref within this plan; becomes the stable opId. */
    ref: string;
    opKind: PlanOperationKind;
    commandKey: string;
    targetId?: string | null;
    payload: Record<string, unknown>;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string;
    evidenceRefs?: string[];
    resolutionRefs?: string[];
    risk?: OperationRisk;
    dependsOnRefs?: string[];
    optional?: boolean;
    included?: boolean;
    preconditionRecordVersion?: string | null;
};

export type BuildCommitPlanInput = {
    orgId: string;
    caseId: string;
    planId?: string;
    version?: number;
    operations: PlanOperationInput[];
    sourceResolutionVersions?: string[];
    builtAt?: string;
};

export class PlanBuildError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = "PlanBuildError";
    }
}

const ATOMICITY_TIER: Record<string, number> = { atomic: 0, dependent: 1, asynchronous: 2 };
const IDENTITY_ATOMIC_GROUP = "identity_core";

/**
 * Stable topological sort honoring (1) dependency edges and (2) atomicity tier,
 * with ref as the deterministic tie-breaker.
 */
function orderOperations(
    inputs: PlanOperationInput[],
    tierOf: (key: string) => number,
): PlanOperationInput[] {
    const byRef = new Map(inputs.map((op) => [op.ref, op]));
    const visited = new Set<string>();
    const result: PlanOperationInput[] = [];

    const sorted = [...inputs].sort((a, b) => {
        const t = tierOf(a.commandKey) - tierOf(b.commandKey);
        return t !== 0 ? t : a.ref.localeCompare(b.ref);
    });

    const visit = (op: PlanOperationInput, stack: Set<string>) => {
        if (visited.has(op.ref)) return;
        if (stack.has(op.ref)) {
            throw new PlanBuildError("dependency_cycle", `Dependency cycle at operation "${op.ref}"`);
        }
        stack.add(op.ref);
        for (const depRef of [...(op.dependsOnRefs ?? [])].sort()) {
            const dep = byRef.get(depRef);
            if (!dep) {
                throw new PlanBuildError("missing_dependency", `Operation "${op.ref}" depends on unknown "${depRef}"`);
            }
            visit(dep, stack);
        }
        stack.delete(op.ref);
        visited.add(op.ref);
        result.push(op);
    };

    for (const op of sorted) visit(op, new Set());
    return result;
}

export function buildCommitPlan(input: BuildCommitPlanInput): CommitPlan {
    if (!input.operations.length) {
        throw new PlanBuildError("empty_plan", "A commit plan requires at least one operation");
    }

    const seenRefs = new Set<string>();
    for (const op of input.operations) {
        if (seenRefs.has(op.ref)) {
            throw new PlanBuildError("duplicate_ref", `Duplicate operation ref "${op.ref}"`);
        }
        seenRefs.add(op.ref);
        if (isForbiddenCommandKey(op.commandKey) || !getCommandMetadata(op.commandKey)) {
            throw new PlanBuildError(
                "unsupported_command",
                `Operation "${op.ref}" targets unsupported command "${op.commandKey}"`,
            );
        }
    }

    const tierOf = (key: string) => ATOMICITY_TIER[getCommandMetadata(key)!.atomicity] ?? 1;
    const ordered = orderOperations(input.operations, tierOf);

    const operations: PlanOperation[] = ordered.map((op, index) => {
        const md = getCommandMetadata(op.commandKey)!;
        const atomicGroup = md.atomicity === "atomic" ? IDENTITY_ATOMIC_GROUP : null;
        return {
            opId: op.ref,
            opOrder: index,
            opKind: op.opKind,
            commandKey: op.commandKey,
            commandVersion: md.version,
            targetType: md.targetType,
            targetId: op.targetId ?? null,
            payload: op.payload,
            before: op.before ?? null,
            after: op.after ?? null,
            reason: op.reason ?? "",
            evidenceRefs: op.evidenceRefs ?? [],
            resolutionRefs: op.resolutionRefs ?? [],
            risk: op.risk ?? "low",
            dependsOn: op.dependsOnRefs ?? [],
            atomicGroup,
            preconditionRecordVersion: op.preconditionRecordVersion ?? null,
            included: op.included ?? true,
            optional: op.optional ?? false,
            reversibility: md.reversibility,
            atomicity: md.atomicity,
            expectedSideEffects: md.downstreamEvents,
        } satisfies PlanOperation;
    });

    const includedOps = operations.filter((o) => o.included);
    const atomicGroups = Array.from(
        new Set(includedOps.map((o) => o.atomicGroup).filter((g): g is string => Boolean(g))),
    );

    const preconditions: PlanPrecondition[] = [];
    for (const op of includedOps) {
        if (op.preconditionRecordVersion && op.targetId) {
            preconditions.push({
                kind: "record_version",
                ref: op.targetId,
                expected: op.preconditionRecordVersion,
                description: `${op.commandKey} expects ${op.targetType} ${op.targetId} at version ${op.preconditionRecordVersion}`,
            });
        }
    }
    for (const gen of input.sourceResolutionVersions ?? []) {
        preconditions.push({
            kind: "resolution_generation",
            ref: gen,
            expected: gen,
            description: `plan built from resolution generation ${gen}`,
        });
    }

    const downstreamEffectPreview = Array.from(
        new Set(includedOps.flatMap((o) => o.expectedSideEffects)),
    );
    const requiresPrivilegedApproval = includedOps.some(
        (o) => o.opKind === "propose_merge" || o.reversibility === "irreversible",
    );
    const reversible = includedOps.every((o) => o.reversibility !== "irreversible");

    const plan: CommitPlan = {
        planId: input.planId ?? `${input.caseId}:v${input.version ?? 1}`,
        orgId: input.orgId,
        caseId: input.caseId,
        version: input.version ?? 1,
        contentHash: "",
        operations,
        preconditions,
        atomicGroups,
        sourceResolutionVersions: input.sourceResolutionVersions ?? [],
        downstreamEffectPreview,
        requiresApproval: true,
        requiresPrivilegedApproval,
        reversible,
        status: "ready_for_approval",
        builtAt: input.builtAt ?? new Date(0).toISOString(),
        supersededBy: null,
        supersededAt: null,
        retentionClass: "audit_authoritative",
    };

    plan.contentHash = computePlanContentHash({
        orgId: plan.orgId,
        caseId: plan.caseId,
        operations: plan.operations,
    });
    return plan;
}

const KIND_VERB: Record<PlanOperationKind, string> = {
    create: "Create",
    update: "Update",
    link: "Link",
    unlink: "Unlink",
    attach: "Attach",
    workflow: "Run workflow",
    no_op: "No change",
    propose_merge: "Propose merge",
};

/** Canonical operator diff view for D3 plan review. */
export function buildPlanDiffView(plan: CommitPlan): PlanDiffView {
    const entries: PlanDiffEntry[] = plan.operations.map((op) => ({
        opId: op.opId,
        kind: op.opKind,
        targetType: op.targetType,
        label: `${KIND_VERB[op.opKind]} ${op.targetType}`,
        before: op.before,
        after: op.after,
        reason: op.reason,
        evidenceRefs: op.evidenceRefs,
        dependsOn: op.dependsOn,
        atomicGroup: op.atomicGroup,
        sideEffects: op.expectedSideEffects,
        risk: op.risk,
        reversibility: op.reversibility,
        included: op.included,
        optional: op.optional,
    }));
    return {
        planId: plan.planId,
        version: plan.version,
        contentHash: plan.contentHash,
        entries,
        atomicGroups: plan.atomicGroups,
        requiresApproval: plan.requiresApproval,
        requiresPrivilegedApproval: plan.requiresPrivilegedApproval,
        reversible: plan.reversible,
    };
}
