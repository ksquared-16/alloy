import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    loadLifecycleStageWorkUnitForDepartment,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    applyStageStatusKeysToQueueDefinition,
    validateEnrollmentPipelineQueueDefinition,
} from "@/lib/lifecycle/lifecycleStageQueueSync";
import { statusKeysForOperatorStageQueueSync } from "@/lib/lifecycle/lifecycleRuntimeBinding";

function isOperatorStage(stage: string): stage is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage);
}

/** Apply current stage status assignments to enrollment pipeline queue lanes (no manual sync). */
export async function syncDepartmentQueueForStage(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stage: LifecycleOperatorStage
): Promise<{ updated: boolean }> {
    if (!isOperatorStage(stage)) return { updated: false };

    const stageWu = await loadLifecycleStageWorkUnitForDepartment(supabase, orgId, departmentId, stage);
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        }))
    );
    const stageStatusKeys = (payload.stages[stage]?.statuses ?? []).map((s) => s.status_key);
    if (!stageStatusKeys.length) return { updated: false };

    const filterKeys = statusKeysForOperatorStageQueueSync(stage, stageStatusKeys);

    let workUnit: { id: string; queue_definition: unknown } | null = stageWu;
    let queue_definition: Record<string, unknown>;

    if (stageWu) {
        queue_definition = applyStatusKeysToLifecycleStageQueueDefinition(
            stageWu.queue_definition,
            filterKeys,
            stage
        );
    } else {
        const { data: pipelineWu, error: wuErr } = await supabase
            .from("work_units")
            .select("id, queue_definition")
            .eq("org_id", orgId)
            .eq("department_id", departmentId)
            .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
            .maybeSingle();
        if (wuErr) throw new Error(wuErr.message);
        if (!pipelineWu) return { updated: false };
        workUnit = pipelineWu as { id: string; queue_definition: unknown };
        queue_definition = applyStageStatusKeysToQueueDefinition(
            workUnit.queue_definition,
            stage,
            filterKeys
        );
        validateEnrollmentPipelineQueueDefinition(queue_definition);
    }

    const { error: upErr } = await supabase
        .from("work_units")
        .update({ queue_definition, updated_at: new Date().toISOString() })
        .eq("id", (workUnit as { id: string }).id)
        .eq("org_id", orgId);

    if (upErr) throw new Error(upErr.message);
    return { updated: true };
}
