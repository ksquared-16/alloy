/**
 * QA / dev — reconcile orphaned BP stage-work tasks after operating-plan edits.
 *
 * Orphan = open operational_tasks row whose `operating_plan_template_key` (or legacy
 * `work_intent_key`) is not in the current stage operating plan `work_templates`.
 *
 * Uses existing paths only:
 *   - cancelOperationalTask
 *   - instantiateStageWorkFromTemplate
 *   - projectStageWorkRuntime
 *
 * Does NOT write stage_key or invent a parallel runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelOperationalTask } from "@/lib/admin/operationalTasksService";
import { fetchEffectiveStatusDefinitionsDirect } from "@/lib/admin/statusDefinitionsResolve";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { projectStageWorkRuntimeSync, taskMatchesStageWorkTemplate } from "@/lib/lifecycle/projectStageWorkRuntime";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveEffectivePrimaryWorkTemplate } from "@/lib/lifecycle/stageOperatingPlanConvergence";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type OrphanedStageWorkTask = {
    task_id: string;
    title: string;
    template_key: string;
    lifecycle_stage_key: string | null;
};

export type ReconcileOrphanedStageWorkReport = {
    opportunity_id: string;
    org_id: string;
    builder_stage_key: string | null;
    operating_plan_source: string | null;
    configured_template_keys: string[];
    primary_template_key: string | null;
    orphaned_tasks: OrphanedStageWorkTask[];
    canceled_task_ids: string[];
    spawned_work_id: string | null;
    spawn_status: "spawned" | "deduped" | "skipped" | "not_needed";
    spawn_reason: string | null;
    dry_run: boolean;
    errors: string[];
    runtime_after: {
        primary_template_key: string | null;
        primary_state: string | null;
        primary_work_id: string | null;
        primary_outcomes_count: number;
        requires_outcome_picker: boolean;
    } | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export function templateKeysForStagePlan(plan: StageOperatingPlanV1 | null): string[] {
    return plan?.work_templates.map((t) => t.template_key) ?? [];
}

export function taskTemplateKey(metadata: Record<string, unknown>): string | null {
    return trimOrNull(metadata.operating_plan_template_key) ?? trimOrNull(metadata.work_intent_key);
}

/** True when open BP task template is absent from the current stage operating plan. */
export function isOrphanedStageWorkTask(
    row: { metadata?: Record<string, unknown> | null; source?: string | null },
    planTemplateKeys: readonly string[],
    stageKey: string | null,
): boolean {
    if (!isBusinessProcessStageWorkTaskRow(row)) return false;
    const md = row.metadata ?? {};
    const templateKey = taskTemplateKey(md);
    if (!templateKey) return false;
    if (planTemplateKeys.includes(templateKey)) return false;
    const taskStage = trimOrNull(md.lifecycle_stage_key);
    if (stageKey && taskStage && taskStage !== stageKey) return false;
    return true;
}

export function findOrphanedOpenStageWorkTasks(
    rows: Array<{
        id: string;
        title: string;
        metadata?: Record<string, unknown> | null;
        source?: string | null;
    }>,
    plan: StageOperatingPlanV1 | null,
    stageKey: string | null,
): OrphanedStageWorkTask[] {
    const planKeys = templateKeysForStagePlan(plan);
    const orphans: OrphanedStageWorkTask[] = [];
    for (const row of rows) {
        if (!isOrphanedStageWorkTask(row, planKeys, stageKey)) continue;
        const md = row.metadata ?? {};
        orphans.push({
            task_id: String(row.id),
            title: String(row.title ?? "Task"),
            template_key: taskTemplateKey(md) ?? "unknown",
            lifecycle_stage_key: trimOrNull(md.lifecycle_stage_key),
        });
    }
    return orphans;
}

function hasOpenTaskForTemplate(
    openRows: Array<{ id: string; title: string; due_at: string; status: string; source: string; metadata: Record<string, unknown> | null; updated_at: string }>,
    stageKey: string,
    template: { template_key: string; work_definition_key?: string | null },
): boolean {
    return openRows.some((row) => taskMatchesStageWorkTemplate(row, stageKey, template));
}

async function stampOrphanCancelMetadata(params: {
    supabase: SupabaseClient;
    orgId: string;
    taskId: string;
    templateKey: string;
    stageKey: string | null;
}): Promise<void> {
    const { data: row } = await params.supabase
        .from("operational_tasks")
        .select("metadata")
        .eq("id", params.taskId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const md =
        row?.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? { ...(row.metadata as Record<string, unknown>) }
            : {};
    md.stage_reconciliation = {
        resolution: "skipped",
        reason: "operating_plan_orphan",
        orphaned_template_key: params.templateKey,
        from_stage_key: params.stageKey,
        reconciled_at: new Date().toISOString(),
        reconciled_by: DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID,
    };
    await params.supabase
        .from("operational_tasks")
        .update({ metadata: md, updated_at: new Date().toISOString() })
        .eq("id", params.taskId)
        .eq("org_id", params.orgId);
}

async function loadOpportunityScope(
    supabase: SupabaseClient,
    opportunityId: string,
): Promise<{
    orgId: string;
    statusKey: string | null;
    departmentId: string | null;
    departmentMetadata: Record<string, unknown>;
    builderStageKey: string | null;
    plan: StageOperatingPlanV1 | null;
    planSource: string | null;
} | null> {
    const { data: opp, error } = await supabase
        .from("opportunities")
        .select("id, org_id, status_key")
        .eq("id", opportunityId)
        .maybeSingle();
    if (error || !opp) return null;

    const orgId = String(opp.org_id);
    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase,
        orgId,
        opportunityId,
    });

    let departmentMetadata: Record<string, unknown> = {};
    if (departmentId) {
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (dept?.metadata && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)) {
            departmentMetadata = dept.metadata as Record<string, unknown>;
        }
    }

    const statusDefs = await fetchEffectiveStatusDefinitionsDirect(supabase, orgId, "opportunities");
    const lifecycleRail = buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata,
        statusKey: String(opp.status_key ?? ""),
        statusDefs,
        workUnitMetadata: null,
    });
    const builderStageKey = lifecycleRail?.current_stage_key ?? null;
    const { plan, source } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey,
    });

    return {
        orgId,
        statusKey: trimOrNull(opp.status_key),
        departmentId,
        departmentMetadata,
        builderStageKey,
        plan,
        planSource: source,
    };
}

export async function reconcileOrphanedStageWorkForOpportunity(params: {
    supabase: SupabaseClient;
    opportunityId: string;
    userId?: string | null;
    dryRun?: boolean;
}): Promise<ReconcileOrphanedStageWorkReport> {
    const opportunityId = params.opportunityId.trim();
    const dryRun = params.dryRun !== false;
    const userId = trimOrNull(params.userId ?? null) ?? DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
    const errors: string[] = [];
    const canceled_task_ids: string[] = [];

    const scope = await loadOpportunityScope(params.supabase, opportunityId);
    if (!scope) {
        return {
            opportunity_id: opportunityId,
            org_id: "",
            builder_stage_key: null,
            operating_plan_source: null,
            configured_template_keys: [],
            primary_template_key: null,
            orphaned_tasks: [],
            canceled_task_ids: [],
            spawned_work_id: null,
            spawn_status: "skipped",
            spawn_reason: "opportunity_not_found",
            dry_run: dryRun,
            errors: ["opportunity_not_found"],
            runtime_after: null,
        };
    }

    const { orgId, departmentId, departmentMetadata, builderStageKey, plan, planSource } = scope;
    const configured_template_keys = templateKeysForStagePlan(plan);
    const primaryTemplate = resolveEffectivePrimaryWorkTemplate(plan);

    const { data: openRows, error: openErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .eq("status", "open")
        .order("due_at", { ascending: true });

    if (openErr) {
        errors.push(openErr.message);
    }

    const openList = (openRows ?? []) as Array<{
        id: string;
        title: string;
        due_at: string;
        status: string;
        source: string;
        metadata: Record<string, unknown> | null;
        updated_at: string;
    }>;

    const orphaned_tasks = findOrphanedOpenStageWorkTasks(openList, plan, builderStageKey);

    if (!dryRun) {
        for (const orphan of orphaned_tasks) {
            const result = await cancelOperationalTask({
                supabase: params.supabase,
                orgId,
                taskId: orphan.task_id,
            });
            if (!result.ok) {
                errors.push(`${orphan.task_id}: ${result.message}`);
                continue;
            }
            await stampOrphanCancelMetadata({
                supabase: params.supabase,
                orgId,
                taskId: orphan.task_id,
                templateKey: orphan.template_key,
                stageKey: builderStageKey,
            });
            canceled_task_ids.push(orphan.task_id);
        }
    }

    let spawned_work_id: string | null = null;
    let spawn_status: ReconcileOrphanedStageWorkReport["spawn_status"] = "skipped";
    let spawn_reason: string | null = null;

    const openAfterCancel = dryRun
        ? openList.filter((row) => !orphaned_tasks.some((o) => o.task_id === row.id))
        : openList.filter((row) => !canceled_task_ids.includes(String(row.id)));

    if (!builderStageKey || !departmentId || !primaryTemplate) {
        spawn_status = "skipped";
        spawn_reason = !builderStageKey ? "no_builder_stage" : !departmentId ? "no_department" : "no_primary_template";
    } else if (hasOpenTaskForTemplate(openAfterCancel, builderStageKey, primaryTemplate)) {
        spawn_status = "not_needed";
        spawn_reason = "primary_template_already_open";
    } else if (dryRun) {
        spawn_status = "spawned";
        spawn_reason = "dry_run_would_spawn_primary";
    } else {
        const spawn = await instantiateStageWorkFromTemplate({
            supabase: params.supabase,
            orgId,
            userId,
            opportunityId,
            stageKey: builderStageKey,
            departmentId,
            template: primaryTemplate,
            departmentMetadata,
        });
        if (spawn.status === "created" || spawn.status === "deduped") {
            spawned_work_id = spawn.work_id;
            spawn_status = spawn.status === "created" ? "spawned" : "deduped";
            spawn_reason = spawn.status === "deduped" ? spawn.reason ?? "deduped" : null;
        } else {
            spawn_status = "skipped";
            spawn_reason = spawn.error ?? "spawn_rejected";
            errors.push(spawn.error ?? "spawn_rejected");
        }
    }

    const { data: finalOpenRows } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .eq("status", "open")
        .order("due_at", { ascending: true });

    const { data: completedRows } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(24);

    const runtime = departmentId && builderStageKey
        ? projectStageWorkRuntimeSync({
              orgId,
              opportunityId,
              departmentId,
              departmentMetadata,
              builderStageKey,
              openRows: (finalOpenRows ?? []) as never[],
              completedRows: (completedRows ?? []) as never[],
          })
        : null;

    const primary = runtime?.primary ?? null;

    return {
        opportunity_id: opportunityId,
        org_id: orgId,
        builder_stage_key: builderStageKey,
        operating_plan_source: planSource,
        configured_template_keys,
        primary_template_key: primaryTemplate?.template_key ?? null,
        orphaned_tasks,
        canceled_task_ids: dryRun ? [] : canceled_task_ids,
        spawned_work_id,
        spawn_status,
        spawn_reason,
        dry_run: dryRun,
        errors,
        runtime_after: primary
            ? {
                  primary_template_key: primary.template_key,
                  primary_state: primary.state,
                  primary_work_id: primary.work_id,
                  primary_outcomes_count: primary.outcomes.length,
                  requires_outcome_picker: primary.requires_outcome_picker,
              }
            : null,
    };
}
