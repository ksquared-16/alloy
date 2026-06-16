import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

function stageTemplateKeys(
    stageWorkRuntime: StageWorkRuntimeProjection | WorkIntentRuntimeProjection | null,
): readonly string[] {
    if (!stageWorkRuntime) return [];
    if ("template_keys" in stageWorkRuntime && Array.isArray(stageWorkRuntime.template_keys)) {
        return stageWorkRuntime.template_keys;
    }
    const key = stageWorkRuntime.work_intent_key?.trim();
    return key ? [key] : [];
}

function collectStageWorkIds(
    stageWorkRuntime: StageWorkRuntimeProjection | WorkIntentRuntimeProjection | null,
): Set<string> {
    const ids = new Set<string>();
    if (!stageWorkRuntime) return ids;
    if ("primary" in stageWorkRuntime) {
        if (stageWorkRuntime.primary?.work_id) ids.add(stageWorkRuntime.primary.work_id);
        for (const item of stageWorkRuntime.additional) {
            if (item.work_id) ids.add(item.work_id);
        }
        return ids;
    }
    if (stageWorkRuntime.work_id) ids.add(stageWorkRuntime.work_id);
    return ids;
}

/** Remove lifecycle stage-work rows from generic follow-up task previews. */
export function filterResidualOperationalTasks(
    preview: InquirySummaryTaskPreviewPayload,
    stageWorkRuntime: StageWorkRuntimeProjection | WorkIntentRuntimeProjection | null,
): InquirySummaryTaskPreviewPayload {
    const stageKey = stageWorkRuntime?.stage_key ?? null;
    const templateKeys = stageTemplateKeys(stageWorkRuntime);
    const workIds = collectStageWorkIds(stageWorkRuntime);

    const open_tasks = preview.open_tasks.filter((task) => {
        if (workIds.has(task.id)) return false;
        return !isOperatingPlanWorkIntentTask(task, stageKey, templateKeys);
    });

    return {
        state: "loaded",
        open_tasks,
        open_count: open_tasks.length,
    };
}
