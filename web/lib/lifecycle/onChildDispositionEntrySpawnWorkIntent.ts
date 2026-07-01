/**
 * On child disposition entry — spawn primary BP work for the opportunity (child journey segment).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { OnStageEntrySpawnWorkIntentResult } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveEffectivePrimaryWorkTemplate } from "@/lib/lifecycle/stageOperatingPlanConvergence";

async function loadOcmStatusMetadata(
    supabase: SupabaseClient,
    orgId: string,
    statusKey: string | null,
): Promise<Record<string, unknown> | null> {
    const key = statusKey?.trim();
    if (!key) return null;
    const { data, error } = await supabase
        .from("status_definitions")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunity_customer_members")
        .eq("status_key", key)
        .eq("is_active", true)
        .maybeSingle();
    if (error || !data) return null;
    const md = (data as { metadata?: unknown }).metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null;
}

export async function onChildDispositionEntrySpawnWorkIntent(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null | undefined;
    opportunityId: string;
    previousStatusKey: string | null;
    nextStatusKey: string | null;
    now?: Date;
}): Promise<OnStageEntrySpawnWorkIntentResult> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const userId = (params.userId?.trim() || DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID).trim();

    if (!orgId || !opportunityId) return { action: "skipped", reason: "missing_scope" };

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: params.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) return { action: "skipped", reason: "no_enrollment_department" };

    const { data: dept, error: deptErr } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr || !dept) return { action: "skipped", reason: "department_load_failed" };

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
        loadOcmStatusMetadata(params.supabase, orgId, params.previousStatusKey),
        loadOcmStatusMetadata(params.supabase, orgId, params.nextStatusKey),
    ]);

    const transition = detectBuilderStageTransition({
        previousStatusKey: params.previousStatusKey,
        nextStatusKey: params.nextStatusKey,
        departmentMetadata,
        previousStatusMetadata,
        nextStatusMetadata,
    });

    if (!transition.stageChanged || !transition.nextBuilderStageKey) {
        return { action: "skipped", reason: "stage_unchanged" };
    }

    const stageKey = transition.nextBuilderStageKey;
    const { plan } = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: stageKey });
    const primaryTemplate = resolveEffectivePrimaryWorkTemplate(plan);
    const intent = resolvePrimaryWorkIntentForStage(stageKey, plan);
    if (!intent || !primaryTemplate) return { action: "skipped", reason: "no_primary_intent" };

    const result = await instantiateStageWorkFromTemplate({
        supabase: params.supabase,
        orgId,
        userId,
        opportunityId,
        stageKey,
        departmentId,
        template: primaryTemplate,
        departmentMetadata,
        now: params.now ?? new Date(),
    });

    if (result.status === "created") return { action: "spawned", work_id: result.work_id };
    if (result.status === "deduped") return { action: "deduped", work_id: result.work_id, reason: result.reason };
    return { action: "skipped", reason: result.error };
}
