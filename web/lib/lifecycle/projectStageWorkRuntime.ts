/**
 * Project operating-plan stage work runtime for drawer / layout / queue surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { completionPolicySummary } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import {
    resolveStageOperatingPlanForStage,
    type StageOperatingPlanV1,
    type StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { primaryWorkIntentProjectionFromStageWork } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type {
    WorkIntentDueUrgency,
    WorkIntentRuntimeOutcome,
    WorkIntentRuntimeProjection,
} from "@/lib/lifecycle/workIntentRuntimeTypes";

export { primaryWorkIntentProjectionFromStageWork };

type TaskDbRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
    metadata: Record<string, unknown> | null;
    updated_at: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function readAttemptCount(metadata: Record<string, unknown>): number {
    const raw = metadata.attempt_count;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        return Math.floor(raw);
    }
    if (typeof raw === "string" && raw.trim()) {
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
}

function readLastOutcome(metadata: Record<string, unknown>): StageWorkItemProjection["last_outcome"] {
    const outcomeKey = trimOrNull(metadata.last_outcome_key);
    if (!outcomeKey) return null;
    return {
        outcome_key: outcomeKey,
        label: trimOrNull(metadata.last_outcome_label) ?? outcomeKey,
        at: trimOrNull(metadata.last_outcome_at),
    };
}

function mapDueUrgency(dueAt: string | null, status: string, now?: Date): WorkIntentDueUrgency {
    if (!dueAt?.trim()) return "none";
    const urgency = operationalTaskDueUrgency({ status, dueAtIso: dueAt, now });
    if (urgency === "overdue") return "overdue";
    if (urgency === "due_soon") return "due_today";
    if (urgency === "open") return "upcoming";
    return "none";
}

function taskRowFromDb(row: TaskDbRow, orgId: string, opportunityId: string): OperationalTaskRow {
    return {
        id: String(row.id),
        org_id: orgId,
        entity_type: "opportunities",
        entity_id: opportunityId,
        assigned_to_user_id: null,
        created_by: "",
        title: trimOrNull(row.title) ?? "Task",
        description: null,
        due_at: String(row.due_at ?? ""),
        status: trimOrNull(row.status) ?? "open",
        source: trimOrNull(row.source) ?? "manual",
        proposal_id: null,
        metadata: row.metadata ?? {},
        created_at: "",
        updated_at: String(row.updated_at ?? ""),
    };
}

function taskMatchesTemplate(
    row: TaskDbRow,
    stageKey: string,
    templateKey: string,
): boolean {
    const md = row.metadata ?? {};
    const mdIntent = trimOrNull(md.work_intent_key) ?? trimOrNull(md.operating_plan_template_key);
    if (mdIntent && mdIntent === templateKey) return true;

    const mdStage = trimOrNull(md.lifecycle_stage_key);
    const work = parseOperationalWorkViewFromTaskRow(taskRowFromDb(row, "", ""));
    const snapshotStage = trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    const stage = mdStage ?? snapshotStage;
    if (stage !== stageKey) return false;

    return mdIntent === templateKey;
}

function buildExecutionSubject(
    opportunityId: string,
    journeySegment: "family" | "child",
): StageOutcomeExecutionSubject {
    return {
        journey_segment: journeySegment,
        opportunity_id: opportunityId,
    };
}

function outcomesForTemplate(plan: StageOperatingPlanV1, templateKey: string): WorkIntentRuntimeOutcome[] {
    const scoped = plan.outcomes
        .filter((o) => {
            const tplKey = o.work_template_key?.trim();
            if (!tplKey) return true;
            return tplKey === templateKey;
        })
        .map((o) => ({
            outcome_key: o.outcome_key,
            label: o.label,
            ...(o.successful === true ? { successful: true } : {}),
        }));
    if (scoped.length) return scoped;
    return plan.outcomes.map((o) => ({
        outcome_key: o.outcome_key,
        label: o.label,
        ...(o.successful === true ? { successful: true } : {}),
    }));
}

function completionPolicyForTemplate(template: StageWorkTemplateV1 | null) {
    if (!template?.completion_policy) {
        return {
            summary: null as string | null,
            min_attempts: null as number | null,
            max_attempts: null as number | null,
        };
    }
    return {
        summary: completionPolicySummary(template.completion_policy),
        min_attempts: template.completion_policy.min_attempts ?? null,
        max_attempts: template.completion_policy.max_attempts ?? null,
    };
}

function buildWorkItemProjection(args: {
    template: StageWorkTemplateV1;
    role: "primary" | "secondary";
    stageKey: string;
    plan: StageOperatingPlanV1;
    openRow: TaskDbRow | null;
    completedRow: TaskDbRow | null;
}): StageWorkItemProjection {
    const { template, role, stageKey, plan, openRow, completedRow } = args;
    const policy = completionPolicyForTemplate(template);
    const outcomes = outcomesForTemplate(plan, template.template_key);
    const automation = buildStageWorkOutcomeAutomationPreview({
        plan,
        templateKey: template.template_key,
    });

    if (openRow) {
        const md = openRow.metadata ?? {};
        const dueAt = String(openRow.due_at ?? "") || null;
        const status = trimOrNull(openRow.status) ?? "open";
        return {
            template_key: template.template_key,
            label: trimOrNull(openRow.title) ?? template.label,
            role,
            state: "open",
            work_id: String(openRow.id),
            due_at: dueAt,
            due_urgency: mapDueUrgency(dueAt, status),
            attempt_count: readAttemptCount(md),
            last_outcome: readLastOutcome(md),
            completed_at: null,
            outcomes,
            completion_policy_summary: policy.summary,
            completion_policy_min_attempts: policy.min_attempts,
            completion_policy_max_attempts: policy.max_attempts,
            outcome_automation_preview: automation,
        };
    }

    if (completedRow) {
        const md = completedRow.metadata ?? {};
        return {
            template_key: template.template_key,
            label: trimOrNull(completedRow.title) ?? template.label,
            role,
            state: "completed",
            work_id: String(completedRow.id),
            due_at: null,
            due_urgency: "none",
            attempt_count: readAttemptCount(md),
            last_outcome: readLastOutcome(md),
            completed_at: trimOrNull(completedRow.updated_at),
            outcomes: [],
            completion_policy_summary: policy.summary,
            completion_policy_min_attempts: policy.min_attempts,
            completion_policy_max_attempts: policy.max_attempts,
            outcome_automation_preview: automation,
        };
    }

    return {
        template_key: template.template_key,
        label: template.label,
        role,
        state: "none",
        work_id: null,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: null,
        outcomes,
        completion_policy_summary: policy.summary,
        completion_policy_min_attempts: policy.min_attempts,
        completion_policy_max_attempts: policy.max_attempts,
        outcome_automation_preview: automation,
    };
}

function sortTemplatesForProjection(
    templates: StageWorkTemplateV1[],
    primaryTemplateKey: string | null,
): StageWorkTemplateV1[] {
    const primaryIdx = templates.findIndex(
        (t) => t.primary || (primaryTemplateKey && t.template_key === primaryTemplateKey),
    );
    if (primaryIdx <= 0) return [...templates];
    const copy = [...templates];
    const [primary] = copy.splice(primaryIdx, 1);
    return [primary!, ...copy];
}

export async function projectStageWorkRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    builderStageKey: string | null;
    stageLabel?: string | null;
}): Promise<StageWorkRuntimeProjection | null> {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? (params.departmentMetadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process?.is_active) return null;

    const stageRecord = process.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const explicitOperatingPlan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    const plan =
        explicitOperatingPlan ??
        (process.key === ENROLLMENT_PROCESS_KEY ?
            defaultStageOperatingPlanForEnrollmentStage(stageKey)
        :   null);

    const primaryIntent = resolvePrimaryWorkIntentForStage(stageKey, explicitOperatingPlan);
    if (!plan?.work_templates.length) return null;

    let departmentId = trimOrNull(params.departmentId);
    if (!departmentId) {
        departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: params.opportunityId,
        });
    }
    if (!departmentId) return null;

    const journeySegment = plan.journey_segment ?? "family";
    const sortedTemplates = sortTemplatesForProjection(
        plan.work_templates,
        primaryIntent?.template_key ?? null,
    );

    const { data: openRows, error: openErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", params.opportunityId)
        .eq("status", "open")
        .order("due_at", { ascending: true })
        .limit(24);

    if (openErr) return null;

    const { data: completedRows, error: completedErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", params.opportunityId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(24);

    if (completedErr) return null;

    const openList = (openRows ?? []) as TaskDbRow[];
    const completedList = (completedRows ?? []) as TaskDbRow[];

    const items: StageWorkItemProjection[] = sortedTemplates.map((template, index) => {
        const openRow =
            openList.find((row) => taskMatchesTemplate(row, stageKey, template.template_key)) ?? null;
        const completedRow =
            !openRow
                ? completedList.find((row) => taskMatchesTemplate(row, stageKey, template.template_key)) ?? null
                : null;
        return buildWorkItemProjection({
            template,
            role: index === 0 ? "primary" : "secondary",
            stageKey,
            plan,
            openRow,
            completedRow,
        });
    });

    const primary = items[0] ?? null;
    const additional = items.slice(1).filter((item) => item.state === "open");

    const requiresOutcomePicker =
        primary?.state === "open" && (primary.outcomes.length ?? 0) > 0;

    return {
        stage_key: stageKey,
        stage_label: trimOrNull(params.stageLabel) ?? trimOrNull(stageRecord?.label) ?? stageKey,
        purpose: trimOrNull(plan.purpose),
        journey_segment: journeySegment,
        template_keys: sortedTemplates.map((t) => t.template_key),
        primary,
        additional,
        execution: {
            department_id: departmentId,
            requires_outcome_picker: requiresOutcomePicker,
            subject: buildExecutionSubject(params.opportunityId, journeySegment),
        },
    };
}

/** @deprecated Prefer projectStageWorkRuntime — returns primary work item only. */
export async function projectWorkIntentRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    builderStageKey: string | null;
}): Promise<WorkIntentRuntimeProjection | null> {
    const runtime = await projectStageWorkRuntime(params);
    return primaryWorkIntentProjectionFromStageWork(runtime);
}
