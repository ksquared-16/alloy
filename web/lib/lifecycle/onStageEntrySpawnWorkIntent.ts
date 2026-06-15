/**
 * On builder stage entry — spawn at most one primary work intent for the opportunity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateWorkFromDefinition } from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    buildLifecycleIntentIdempotencyKey,
    buildLifecycleIntentSubjectFingerprint,
    resolvePrimaryWorkIntentForStage,
} from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveStageOperatingPlanForStage, type StageWorkDuePolicy } from "@/lib/lifecycle/stageOperatingPlanV1";

export type OnStageEntrySpawnWorkIntentResult = {
    action: "spawned" | "deduped" | "skipped";
    work_id?: string;
    reason?: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function dueAtIsoFromPolicy(duePolicy: StageWorkDuePolicy, now: Date): string {
    if (duePolicy.kind === "same_day") {
        const end = new Date(now);
        end.setUTCHours(23, 59, 59, 999);
        return end.toISOString();
    }
    const due = new Date(now);
    due.setUTCDate(due.getUTCDate() + Math.max(0, duePolicy.days));
    return due.toISOString();
}

async function loadStatusMetadata(
    supabase: SupabaseClient,
    orgId: string,
    statusKey: string | null,
): Promise<Record<string, unknown> | null> {
    const key = trimOrNull(statusKey);
    if (!key) return null;
    const { data, error } = await supabase
        .from("status_definitions")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("status_key", key)
        .eq("is_active", true)
        .maybeSingle();
    if (error || !data) return null;
    const md = (data as { metadata?: unknown }).metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null;
}

export type OnStageEntrySpawnWorkIntentInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null | undefined;
    opportunityId: string;
    previousStatusKey: string | null;
    nextStatusKey: string | null;
    now?: Date;
};

export async function onStageEntrySpawnWorkIntent(
    input: OnStageEntrySpawnWorkIntentInput,
): Promise<OnStageEntrySpawnWorkIntentResult> {
    const opportunityId = input.opportunityId.trim();
    const orgId = input.orgId.trim();
    const userId = trimOrNull(input.userId ?? null);

    if (!orgId || !opportunityId) {
        return { action: "skipped", reason: "missing_scope" };
    }
    if (!userId) {
        return { action: "skipped", reason: "no_actor" };
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) {
        return { action: "skipped", reason: "no_enrollment_department" };
    }

    const { data: dept, error: deptErr } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr || !dept) {
        return { action: "skipped", reason: "department_load_failed" };
    }

    const departmentMetadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process || process.key !== ENROLLMENT_PROCESS_KEY || !process.is_active) {
        return { action: "skipped", reason: "no_active_enrollment_process" };
    }

    const [previousStatusMetadata, nextStatusMetadata] = await Promise.all([
        loadStatusMetadata(input.supabase, orgId, input.previousStatusKey),
        loadStatusMetadata(input.supabase, orgId, input.nextStatusKey),
    ]);

    const transition = detectBuilderStageTransition({
        previousStatusKey: input.previousStatusKey,
        nextStatusKey: input.nextStatusKey,
        departmentMetadata,
        previousStatusMetadata,
        nextStatusMetadata,
    });

    if (!transition.stageChanged || !transition.nextBuilderStageKey) {
        return { action: "skipped", reason: "stage_unchanged" };
    }

    const stageKey = transition.nextBuilderStageKey;
    const stageRecord = process.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const explicitPlan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);

    const intent = resolvePrimaryWorkIntentForStage(stageKey, explicitPlan);
    if (!intent) {
        return { action: "skipped", reason: "no_primary_intent" };
    }

    const now = input.now ?? new Date();
    const idempotencyKey = buildLifecycleIntentIdempotencyKey({
        orgId,
        opportunityId,
        stageKey,
        workIntentKey: intent.work_intent_key,
    });
    const subjectFingerprint = buildLifecycleIntentSubjectFingerprint({
        orgId,
        opportunityId,
        stageKey,
    });

    const result = await instantiateWorkFromDefinition({
        supabase: input.supabase,
        orgId,
        userId,
        workDefinitionKey: intent.work_definition_key,
        subject: { entityType: "opportunities", entityId: opportunityId },
        subjectFingerprint,
        provenance: { source: "lifecycle_template", idempotency_key: idempotencyKey },
        contextSnapshot: { lifecycle_stage_key: stageKey },
        titleOverride: intent.label,
        description: intent.description ?? null,
        dueAtOverride: dueAtIsoFromPolicy(intent.due_policy, now),
        idempotencyKey,
        metadata: {
            work_intent_key: intent.work_intent_key,
            template_key: intent.template_key ?? intent.work_intent_key,
            lifecycle_stage_key: stageKey,
            attempt_count: 0,
            department_id: departmentId,
            operating_plan_template: intent.source === "operating_plan_template",
        },
        resolveParams: { departmentMetadata, stageKey },
        now,
    });

    if (result.status === "created") {
        return { action: "spawned", work_id: result.work.id };
    }
    if (result.status === "deduped") {
        return { action: "deduped", work_id: result.existingWork.id, reason: result.reason };
    }

    return {
        action: "skipped",
        reason: result.status === "rejected" ? result.reason : "instantiate_failed",
    };
}

/**
 * Entry from opportunity_status_changed fan-out (emitStatusChangedEvent).
 */
export async function onStageEntrySpawnWorkIntentFromOpportunityStatusChange(
    params: OnStageEntrySpawnWorkIntentInput,
): Promise<OnStageEntrySpawnWorkIntentResult> {
    return onStageEntrySpawnWorkIntent(params);
}
