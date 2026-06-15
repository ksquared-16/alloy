/**
 * Project operating-plan work intent runtime for drawer / layout surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import type {
    WorkIntentDueUrgency,
    WorkIntentRuntimeProjection,
} from "@/lib/lifecycle/workIntentRuntimeTypes";

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

function readLastOutcome(metadata: Record<string, unknown>): WorkIntentRuntimeProjection["last_outcome"] {
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

function taskMatchesStageWorkIntent(
    row: TaskDbRow,
    stageKey: string,
    workIntentKey: string,
): boolean {
    const md = row.metadata ?? {};
    const mdIntent = trimOrNull(md.work_intent_key);
    if (mdIntent && mdIntent === workIntentKey) return true;

    const mdStage = trimOrNull(md.lifecycle_stage_key);
    const work = parseOperationalWorkViewFromTaskRow(taskRowFromDb(row, "", ""));
    const snapshotStage = trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    const stage = mdStage ?? snapshotStage;
    if (stage !== stageKey) return false;

    if (mdIntent) return true;
    return work.provenance.source === "lifecycle_template";
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

function buildProjectionShell(params: {
    state: WorkIntentRuntimeProjection["state"];
    stageKey: string;
    workIntentKey: string;
    label: string;
    journeySegment: "family" | "child";
    departmentId: string;
    opportunityId: string;
    outcomes: WorkIntentRuntimeProjection["outcomes"];
    workRow: TaskDbRow | null;
}): WorkIntentRuntimeProjection {
    const md = params.workRow?.metadata ?? {};
    const dueAt = params.workRow ? String(params.workRow.due_at ?? "") || null : null;
    const status = params.workRow ? trimOrNull(params.workRow.status) ?? "open" : "open";
    const outcomes = params.outcomes;
    const requiresOutcomePicker = params.state === "open" && outcomes.length > 0;

    return {
        state: params.state,
        stage_key: params.stageKey,
        work_intent_key: params.workIntentKey,
        label: params.workRow ? trimOrNull(params.workRow.title) ?? params.label : params.label,
        journey_segment: params.journeySegment,
        work_id: params.workRow ? String(params.workRow.id) : null,
        due_at: dueAt,
        due_urgency: mapDueUrgency(dueAt, status),
        attempt_count: params.workRow ? readAttemptCount(md) : 0,
        last_outcome: params.workRow ? readLastOutcome(md) : null,
        completed_at:
            params.state === "completed" && params.workRow ?
                trimOrNull(params.workRow.updated_at)
            :   null,
        outcomes,
        execution: {
            department_id: params.departmentId,
            requires_outcome_picker: requiresOutcomePicker,
            subject: buildExecutionSubject(params.opportunityId, params.journeySegment),
        },
    };
}

export async function projectWorkIntentRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    builderStageKey: string | null;
}): Promise<WorkIntentRuntimeProjection | null> {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const primaryIntent = resolvePrimaryWorkIntentForStage(stageKey);
    if (!primaryIntent) return null;

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? (params.departmentMetadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process?.is_active) return null;

    let departmentId = trimOrNull(params.departmentId);
    if (!departmentId) {
        departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: params.opportunityId,
        });
    }
    if (!departmentId) return null;

    const stageRecord = process.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const plan =
        resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey) ??
        (process.key === ENROLLMENT_PROCESS_KEY ?
            defaultStageOperatingPlanForEnrollmentStage(stageKey)
        :   null);
    if (!plan) return null;

    const journeySegment = plan.journey_segment ?? "family";
    const outcomes = plan.outcomes.map((o) => ({
        outcome_key: o.outcome_key,
        label: o.label,
        ...(o.successful === true ? { successful: true } : {}),
    }));

    const { data: openRows, error: openErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", params.opportunityId)
        .eq("status", "open")
        .order("due_at", { ascending: true })
        .limit(12);

    if (openErr) return null;

    const openMatches = ((openRows ?? []) as TaskDbRow[]).filter((row) =>
        taskMatchesStageWorkIntent(row, stageKey, primaryIntent.work_intent_key),
    );
    const openRow =
        openMatches.find((row) => trimOrNull(row.metadata?.work_intent_key) === primaryIntent.work_intent_key)
        ?? openMatches[0]
        ?? null;

    if (openRow) {
        return buildProjectionShell({
            state: "open",
            stageKey,
            workIntentKey: primaryIntent.work_intent_key,
            label: primaryIntent.label,
            journeySegment,
            departmentId,
            opportunityId: params.opportunityId,
            outcomes,
            workRow: openRow,
        });
    }

    const { data: completedRows, error: completedErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", params.opportunityId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(12);

    if (completedErr) {
        return buildProjectionShell({
            state: "none",
            stageKey,
            workIntentKey: primaryIntent.work_intent_key,
            label: primaryIntent.label,
            journeySegment,
            departmentId,
            opportunityId: params.opportunityId,
            outcomes,
            workRow: null,
        });
    }

    const completedMatches = ((completedRows ?? []) as TaskDbRow[]).filter((row) =>
        taskMatchesStageWorkIntent(row, stageKey, primaryIntent.work_intent_key),
    );
    const completedRow =
        completedMatches.find((row) => trimOrNull(row.metadata?.work_intent_key) === primaryIntent.work_intent_key)
        ?? completedMatches[0]
        ?? null;

    if (completedRow) {
        return buildProjectionShell({
            state: "completed",
            stageKey,
            workIntentKey: primaryIntent.work_intent_key,
            label: primaryIntent.label,
            journeySegment,
            departmentId,
            opportunityId: params.opportunityId,
            outcomes: [],
            workRow: completedRow,
        });
    }

    return buildProjectionShell({
        state: "none",
        stageKey,
        workIntentKey: primaryIntent.work_intent_key,
        label: primaryIntent.label,
        journeySegment,
        departmentId,
        opportunityId: params.opportunityId,
        outcomes,
        workRow: null,
    });
}
