/**
 * Commit Plan / operation / approval persistence (D1).
 *
 * Server-side only (Processing service owns authorship + approval binding). Plans
 * and operations are immutable; a material edit inserts a NEW version and
 * supersedes the prior, invalidating its approval.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    ApprovalAuthority,
    CommitPlan,
    CommitPlanStatus,
    PlanApproval,
    PlanOperation,
    PlanPrecondition,
} from "./planTypes";

type Client = Pick<SupabaseClient, "from">;

function operationRow(orgId: string, planId: string, op: PlanOperation): Record<string, unknown> {
    return {
        org_id: orgId,
        plan_id: planId,
        op_id: op.opId,
        op_order: op.opOrder,
        op_kind: op.opKind,
        command_key: op.commandKey,
        command_version: op.commandVersion,
        target_type: op.targetType,
        target_id: op.targetId,
        payload: op.payload,
        before_snapshot: op.before,
        after_values: op.after,
        reason: op.reason,
        evidence_refs: op.evidenceRefs,
        resolution_refs: op.resolutionRefs,
        risk: op.risk,
        depends_on: op.dependsOn,
        atomic_group: op.atomicGroup,
        precondition_record_version: op.preconditionRecordVersion,
        included: op.included,
        optional: op.optional,
        reversibility: op.reversibility,
        expected_side_effects: op.expectedSideEffects,
    };
}

function operationFromRow(row: Record<string, unknown>): PlanOperation {
    return {
        opId: String(row.op_id),
        opOrder: Number(row.op_order),
        opKind: row.op_kind as PlanOperation["opKind"],
        commandKey: String(row.command_key),
        commandVersion: String(row.command_version),
        targetType: row.target_type as PlanOperation["targetType"],
        targetId: (row.target_id as string | null) ?? null,
        payload: (row.payload as Record<string, unknown>) ?? {},
        before: (row.before_snapshot as Record<string, unknown> | null) ?? null,
        after: (row.after_values as Record<string, unknown> | null) ?? null,
        reason: (row.reason as string) ?? "",
        evidenceRefs: (row.evidence_refs as string[]) ?? [],
        resolutionRefs: (row.resolution_refs as string[]) ?? [],
        risk: (row.risk as PlanOperation["risk"]) ?? "low",
        dependsOn: (row.depends_on as string[]) ?? [],
        atomicGroup: (row.atomic_group as string | null) ?? null,
        preconditionRecordVersion: (row.precondition_record_version as string | null) ?? null,
        included: Boolean(row.included),
        optional: Boolean(row.optional),
        reversibility: (row.reversibility as PlanOperation["reversibility"]) ?? "reversible",
        atomicity: row.atomic_group ? "atomic" : "dependent",
        expectedSideEffects: (row.expected_side_effects as string[]) ?? [],
    };
}

function planFromRow(row: Record<string, unknown>, operations: PlanOperation[]): CommitPlan {
    return {
        planId: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        version: Number(row.version),
        contentHash: String(row.content_hash),
        operations: [...operations].sort((a, b) => a.opOrder - b.opOrder),
        preconditions: (row.preconditions as PlanPrecondition[]) ?? [],
        atomicGroups: (row.atomic_groups as string[]) ?? [],
        sourceResolutionVersions: (row.source_resolution_versions as string[]) ?? [],
        downstreamEffectPreview: (row.downstream_effect_preview as string[]) ?? [],
        requiresApproval: Boolean(row.requires_approval),
        requiresPrivilegedApproval: Boolean(row.requires_privileged_approval),
        reversible: Boolean(row.reversible),
        status: (row.status as CommitPlanStatus) ?? "draft",
        builtAt: String(row.built_at),
        supersededBy: (row.superseded_by as string | null) ?? null,
        supersededAt: (row.superseded_at as string | null) ?? null,
        retentionClass: (row.retention_class as string) ?? "audit_authoritative",
    };
}

/** Persist a new plan version + its operations. Returns the plan with its DB id. */
export async function insertCommitPlan(supabase: Client, plan: CommitPlan): Promise<CommitPlan> {
    const { data, error } = await supabase
        .from("processing_commit_plans")
        .insert({
            org_id: plan.orgId,
            case_id: plan.caseId,
            version: plan.version,
            content_hash: plan.contentHash,
            source_resolution_versions: plan.sourceResolutionVersions,
            preconditions: plan.preconditions,
            atomic_groups: plan.atomicGroups,
            downstream_effect_preview: plan.downstreamEffectPreview,
            requires_approval: plan.requiresApproval,
            requires_privileged_approval: plan.requiresPrivilegedApproval,
            reversible: plan.reversible,
            status: plan.status,
            retention_class: plan.retentionClass,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "insert_commit_plan_failed");
    const planId = String((data as { id: string }).id);

    const rows = plan.operations.map((op) => operationRow(plan.orgId, planId, op));
    const { error: opErr } = await supabase.from("processing_plan_operations").insert(rows);
    if (opErr) throw new Error(opErr.message);

    return planFromRow(data as Record<string, unknown>, plan.operations);
}

export async function loadCommitPlan(
    supabase: Client,
    args: { orgId: string; planId: string },
): Promise<CommitPlan | null> {
    const { data: planRow } = await supabase
        .from("processing_commit_plans")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("id", args.planId)
        .maybeSingle();
    if (!planRow) return null;
    const { data: opRows } = await supabase
        .from("processing_plan_operations")
        .select("*")
        .eq("plan_id", args.planId);
    const operations = ((opRows as Record<string, unknown>[]) ?? []).map(operationFromRow);
    return planFromRow(planRow as Record<string, unknown>, operations);
}

/** Mark a plan superseded by its successor and invalidate its active approval. */
export async function supersedePlan(
    supabase: Client,
    args: { orgId: string; previousPlanId: string; newPlanId: string; supersededAt?: string },
): Promise<void> {
    const now = args.supersededAt ?? new Date().toISOString();
    await supabase
        .from("processing_commit_plans")
        .update({ superseded_by: args.newPlanId, superseded_at: now, status: "superseded" })
        .eq("org_id", args.orgId)
        .eq("id", args.previousPlanId);
    await invalidateApprovalsForPlan(supabase, {
        orgId: args.orgId,
        planId: args.previousPlanId,
        reason: "plan_superseded_by_new_version",
    });
}

export async function updatePlanStatus(
    supabase: Client,
    args: { orgId: string; planId: string; status: CommitPlanStatus },
): Promise<void> {
    await supabase
        .from("processing_commit_plans")
        .update({ status: args.status })
        .eq("org_id", args.orgId)
        .eq("id", args.planId);
}

export async function insertApproval(supabase: Client, approval: PlanApproval): Promise<string> {
    const { data, error } = await supabase
        .from("processing_approvals")
        .insert({
            org_id: approval.orgId,
            case_id: approval.caseId,
            plan_id: approval.planId,
            plan_version: approval.planVersion,
            plan_content_hash: approval.planContentHash,
            approving_actor: approval.approvingActor,
            approval_authority: approval.approvalAuthority,
            decision: approval.decision,
            included_operation_ids: approval.includedOperationIds,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "insert_approval_failed");
    await updatePlanStatus(supabase, { orgId: approval.orgId, planId: approval.planId, status: "approved" });
    return String((data as { id: string }).id);
}

export async function invalidateApprovalsForPlan(
    supabase: Client,
    args: { orgId: string; planId: string; reason: string },
): Promise<void> {
    await supabase
        .from("processing_approvals")
        .update({ invalidated_at: new Date().toISOString(), invalidation_reason: args.reason })
        .eq("org_id", args.orgId)
        .eq("plan_id", args.planId)
        .is("invalidated_at", null);
}

export async function loadActiveApproval(
    supabase: Client,
    args: { orgId: string; planId: string },
): Promise<PlanApproval | null> {
    const { data } = await supabase
        .from("processing_approvals")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("plan_id", args.planId)
        .is("invalidated_at", null)
        .eq("decision", "approved")
        .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
        approvalId: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        planId: String(row.plan_id),
        planVersion: Number(row.plan_version),
        planContentHash: String(row.plan_content_hash),
        approvingActor: String(row.approving_actor),
        approvalAuthority: (row.approval_authority as ApprovalAuthority) ?? "standard",
        decision: (row.decision as PlanApproval["decision"]) ?? "approved",
        includedOperationIds: (row.included_operation_ids as string[]) ?? [],
        approvedAt: String(row.approved_at),
        invalidatedAt: (row.invalidated_at as string | null) ?? null,
        invalidationReason: (row.invalidation_reason as string | null) ?? null,
    };
}
