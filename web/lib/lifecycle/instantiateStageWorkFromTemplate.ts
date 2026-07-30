/**
 * Shared stage work instantiation — stage entry spawn and create_next_work automation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateWorkFromDefinition } from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
import { buildBusinessProcessWorkTaskMetadata } from "@/lib/lifecycle/buildBusinessProcessWorkTaskMetadata";
import {
    buildBusinessProcessWorkRuntimeFingerprint,
    findOpenBusinessProcessWorkBySemanticIdentity,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
import {
    buildLifecycleIntentIdempotencyKey,
    buildLifecycleIntentSubjectFingerprint,
} from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { resolveEffectiveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import type { StageWorkDuePolicy, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    effectiveFollowUpDuePolicy,
    resolveFollowUpWorkDueAt,
    type StageFollowUpWorkDuePolicyV1,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";

export type InstantiateStageWorkFromTemplateResult =
    | { status: "created"; work_id: string }
    | { status: "deduped"; work_id: string; reason?: string }
    | { status: "rejected"; error: string };

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

function dueAtFromTargetDays(dueDays: number | null | undefined, now: Date): string | undefined {
    if (dueDays == null || !Number.isFinite(dueDays)) return undefined;
    const due = new Date(now);
    due.setUTCDate(due.getUTCDate() + Math.max(0, Math.floor(dueDays)));
    return due.toISOString();
}

export async function instantiateStageWorkFromTemplate(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    stageKey: string;
    departmentId: string;
    template: Pick<StageWorkTemplateV1, "template_key" | "label" | "work_definition_key" | "due_policy">;
    departmentMetadata?: Record<string, unknown> | null;
    dueDaysOverride?: number | null;
    followUpDuePolicy?: StageFollowUpWorkDuePolicyV1 | null;
    scheduledEventStartAt?: string | null;
    stageEnteredAt?: string | null;
    fieldValueAt?: string | null;
    now?: Date;
}): Promise<InstantiateStageWorkFromTemplateResult> {
    const templateKey = params.template.template_key.trim();
    const stageKey = params.stageKey.trim();
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    if (!templateKey || !stageKey || !orgId || !opportunityId) {
        return { status: "rejected", error: "missing_scope" };
    }

    const resolvedDefinition = resolveEffectiveWorkDefinitionKeyFromTemplate(params.template, {
        departmentMetadata: params.departmentMetadata ?? null,
        stageKey,
    });
    if (!resolvedDefinition.ok) {
        return {
            status: "rejected",
            error: "Work definition is unknown, disabled, or not available for this context.",
        };
    }

    const workDefinitionKey = resolvedDefinition.work_definition_key;
    const bpRuntimeFingerprint = buildBusinessProcessWorkRuntimeFingerprint({
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        workDefinitionKey,
        templateKey,
    });

    const existingBpTask = await findOpenBusinessProcessWorkBySemanticIdentity({
        supabase: params.supabase,
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        workDefinitionKey,
        templateKey,
    });
    if (existingBpTask?.id) {
        return { status: "deduped", work_id: existingBpTask.id, reason: "bp_runtime_fingerprint" };
    }
    const now = params.now ?? new Date();
    const idempotencyKey = buildLifecycleIntentIdempotencyKey({
        orgId,
        opportunityId,
        stageKey,
        workIntentKey: templateKey,
    });
    const subjectFingerprint = buildLifecycleIntentSubjectFingerprint({
        orgId,
        opportunityId,
        stageKey,
    });

    let dueAtOverride: string | undefined;
    const followUpPolicy = params.followUpDuePolicy
        ? effectiveFollowUpDuePolicy(params.followUpDuePolicy, params.dueDaysOverride)
        : null;
    if (followUpPolicy) {
        const resolved = resolveFollowUpWorkDueAt({
            policy: followUpPolicy,
            legacyDueDays: params.dueDaysOverride,
            outcomeRecordedAt: now,
            scheduledEventStartAt: params.scheduledEventStartAt,
            stageEnteredAt: params.stageEnteredAt,
            fieldValueAt: params.fieldValueAt,
        });
        if (!resolved.ok) {
            return { status: "rejected", error: resolved.reason };
        }
        dueAtOverride = resolved.dueAt ?? undefined;
    } else {
        dueAtOverride =
            dueAtFromTargetDays(params.dueDaysOverride, now)
            ?? dueAtIsoFromPolicy(params.template.due_policy, now);
    }

    const result = await instantiateWorkFromDefinition({
        supabase: params.supabase,
        orgId,
        userId: params.userId,
        workDefinitionKey,
        subject: { entityType: "opportunities", entityId: opportunityId },
        subjectFingerprint,
        provenance: { source: "lifecycle_template", idempotency_key: idempotencyKey },
        contextSnapshot: { lifecycle_stage_key: stageKey },
        titleOverride: params.template.label,
        dueAtOverride,
        idempotencyKey,
        metadata: buildBusinessProcessWorkTaskMetadata({
            workIntentKey: templateKey,
            operatingPlanTemplateKey: templateKey,
            lifecycleStageKey: stageKey,
            departmentId: params.departmentId,
            attemptCount: 0,
            bpRuntimeFingerprint,
            extra: { work_definition_key: workDefinitionKey },
        }),
        resolveParams: {
            departmentMetadata: params.departmentMetadata ?? null,
            stageKey,
        },
        now,
    });

    if (result.status === "created") {
        return { status: "created", work_id: result.work.id };
    }
    if (result.status === "deduped") {
        return { status: "deduped", work_id: result.existingWork.id, reason: result.reason };
    }
    return {
        status: "rejected",
        error: result.status === "rejected" ? (result.message ?? result.reason) : "instantiate_failed",
    };
}
