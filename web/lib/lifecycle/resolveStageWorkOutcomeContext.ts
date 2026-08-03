/**
 * Resolve stage work outcome picker context from an operational task row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { childParticipationIdentityFromWire } from "@/lib/lifecycle/childParticipationIdentity";
import { resolveJourneySegment } from "@/lib/lifecycle/grainVocabulary";

export type StageWorkOutcomeContext = {
    requires_outcome_picker: boolean;
    department_id: string;
    stage_key: string;
    work_id: string;
    work_title: string;
    outcomes: StageCompletionOutcomeV1[];
    subject: StageOutcomeExecutionSubject;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function lifecycleStageKeyFromTask(task: OperationalTaskRow): string | null {
    const work = parseOperationalWorkViewFromTaskRow(task);
    const fromSnapshot = trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    if (fromSnapshot) return fromSnapshot;
    const md = task.metadata ?? {};
    return trimOrNull(md.lifecycle_stage_key);
}

function departmentIdFromTaskMetadata(task: OperationalTaskRow): string | null {
    const md = task.metadata ?? {};
    return trimOrNull(md.department_id);
}

/** Resolve enrollment department for an opportunity when task metadata lacks department_id. */
export async function resolveEnrollmentDepartmentForOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<string | null> {
    const { data: opp, error } = await params.supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", params.opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (error || !opp) return null;

    const md =
        (opp as { metadata?: Record<string, unknown> }).metadata != null &&
        typeof (opp as { metadata?: unknown }).metadata === "object"
            ? ((opp as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
            : {};
    const fromMd = trimOrNull(md.enrollment_department_id) ?? trimOrNull(md.department_id);
    if (fromMd) return fromMd;

    const { data: depts } = await params.supabase
        .from("departments")
        .select("id, metadata")
        .eq("org_id", params.orgId)
        .eq("is_active", true);

    for (const row of depts ?? []) {
        const meta =
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const builder = lifecycleBuilderFromDepartmentMetadata(meta);
        const process = builder ? activeLifecycleProcess(builder) : null;
        if (process?.key === "enrollment" && process.is_active) {
            return String((row as { id: string }).id);
        }
    }
    return null;
}

export async function resolveStageWorkOutcomeContext(params: {
    supabase: SupabaseClient;
    orgId: string;
    task: OperationalTaskRow;
    departmentId?: string | null;
}): Promise<StageWorkOutcomeContext | null> {
    const { task } = params;
    if (task.status !== "open") return null;
    if (task.entity_type !== "opportunities" || !task.entity_id?.trim()) return null;

    const stageKey = lifecycleStageKeyFromTask(task);
    if (!stageKey) return null;

    let departmentId = params.departmentId?.trim() || departmentIdFromTaskMetadata(task);
    if (!departmentId) {
        departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: task.entity_id,
        });
    }
    if (!departmentId) return null;

    const { data: dept, error: deptErr } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (deptErr || !dept) return null;

    const metadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const plan = resolveEffectiveStageOperatingPlan({
        departmentMetadata: metadata,
        builderStageKey: stageKey,
    }).plan;
    if (!plan?.outcomes.length) return null;

    // Reconciled across the plan and the stage, not read from the plan alone — a stage configured
    // child-grain whose plan still says family must not hand back a family subject to execute.
    const segment = resolveJourneySegment({
        planSegment: plan.journey_segment,
        stageGrain: stageRecord?.grain,
    });
    if (!segment.ok) return null;
    const journeySegment = segment.segment;
    const subject: StageOutcomeExecutionSubject = {
        journey_segment: journeySegment,
        opportunity_id: task.entity_id,
    };

    if (journeySegment === "child") {
        // THIS task's own metadata — not a scrape across the family. The task IS the work being
        // acted on, so the child it names is the child the operator chose.
        const identity = childParticipationIdentityFromWire(task.metadata ?? {});
        if (identity.subjectId) subject.customer_member_id = identity.subjectId;
        if (identity.participationId) subject.process_instance_id = identity.participationId;
        // Legacy OCM id kept for the executor's temporary fallback when the above are absent.
        if (identity.legacyOcmId) subject.opportunity_customer_member_id = identity.legacyOcmId;
    }

    return {
        requires_outcome_picker: true,
        department_id: departmentId,
        stage_key: stageKey,
        work_id: task.id,
        work_title: task.title.trim() || "Task",
        outcomes: plan.outcomes,
        subject,
    };
}
