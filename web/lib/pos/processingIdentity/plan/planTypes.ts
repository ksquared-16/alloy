/**
 * Processing Identity Resolution — D1 Commit Plan model.
 *
 * A Commit Plan is a versioned, immutable, content-hashed diff. Its operations
 * target registered semantic commands (D0) — never physical tables. Approval
 * binds to exactly one (version, content_hash); any material edit creates a new
 * version and voids the prior approval (Decision F).
 */

import type {
    CommandAtomicity,
    CommandReversibility,
    CommandTargetType,
} from "../commands/commandContracts";

/** Canonical operator diff kind (D1 §18 diff model). */
export type PlanOperationKind =
    | "create"
    | "update"
    | "link"
    | "unlink"
    | "attach"
    | "workflow"
    | "no_op"
    | "propose_merge";

export type OperationRisk = "low" | "medium" | "high";

/** One typed operation in a plan. Immutable once the plan version is finalized. */
export type PlanOperation = {
    /** Stable operation id, unique within the plan (deterministic from input ref). */
    opId: string;
    opOrder: number;
    opKind: PlanOperationKind;
    /** Registered semantic command key (D0). Never a physical table. */
    commandKey: string;
    commandVersion: string;
    targetType: CommandTargetType;
    /** Existing record targeted by update/link/attach (null for create). */
    targetId: string | null;
    /** Typed command payload. */
    payload: Record<string, unknown>;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string;
    evidenceRefs: string[];
    resolutionRefs: string[];
    risk: OperationRisk;
    /** opIds this operation depends on. */
    dependsOn: string[];
    /** Atomic group label; operations in a group commit in one transaction. */
    atomicGroup: string | null;
    /** Optimistic-concurrency token asserted at execution. */
    preconditionRecordVersion: string | null;
    /** Whether this op is part of the approved/executed plan. */
    included: boolean;
    /** Whether this op may be excluded without breaking dependents. */
    optional: boolean;
    reversibility: CommandReversibility;
    atomicity: CommandAtomicity;
    expectedSideEffects: string[];
};

export type PlanPrecondition = {
    kind: "record_version" | "no_blocking_conflict" | "resolution_generation";
    ref: string;
    expected: string | null;
    description: string;
};

export type CommitPlanStatus =
    | "draft"
    | "ready_for_approval"
    | "approved"
    | "superseded"
    | "committing"
    | "committed"
    | "partially_committed";

export type CommitPlan = {
    planId: string;
    orgId: string;
    caseId: string;
    version: number;
    contentHash: string;
    operations: PlanOperation[];
    preconditions: PlanPrecondition[];
    /** Ordered atomic group labels present in the plan. */
    atomicGroups: string[];
    sourceResolutionVersions: string[];
    downstreamEffectPreview: string[];
    requiresApproval: boolean;
    requiresPrivilegedApproval: boolean;
    reversible: boolean;
    status: CommitPlanStatus;
    builtAt: string;
    supersededBy: string | null;
    supersededAt: string | null;
    retentionClass: string;
};

export type ApprovalAuthority = "standard" | "privileged";
export type ApprovalDecision = "approved" | "declined";

export type PlanApproval = {
    approvalId: string;
    orgId: string;
    caseId: string;
    planId: string;
    planVersion: number;
    planContentHash: string;
    approvingActor: string;
    approvalAuthority: ApprovalAuthority;
    decision: ApprovalDecision;
    includedOperationIds: string[];
    approvedAt: string;
    invalidatedAt: string | null;
    invalidationReason: string | null;
};

/** Canonical operator diff line for D3 plan review. */
export type PlanDiffEntry = {
    opId: string;
    kind: PlanOperationKind;
    targetType: CommandTargetType;
    label: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string;
    evidenceRefs: string[];
    dependsOn: string[];
    atomicGroup: string | null;
    sideEffects: string[];
    risk: OperationRisk;
    reversibility: CommandReversibility;
    included: boolean;
    optional: boolean;
};

export type PlanDiffView = {
    planId: string;
    version: number;
    contentHash: string;
    entries: PlanDiffEntry[];
    atomicGroups: string[];
    requiresApproval: boolean;
    requiresPrivilegedApproval: boolean;
    reversible: boolean;
};
