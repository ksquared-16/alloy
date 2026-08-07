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
    const key =
        "work_intent_key" in stageWorkRuntime ? stageWorkRuntime.work_intent_key?.trim() : null;
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

/**
 * Residual follow-ups only — strips stage-operating-plan work (Contact Family, etc.).
 *
 * Focus Panel Activity → Work Items must NOT use this filter: operators need the same
 * Contact Family row they see in global Work Items. Prefer the unfiltered inquiry
 * preview (`tasks_raw` / `summaries.tasks`) for that surface.
 *
 * Kept for queue/golden-path callers that still want ad-hoc follow-ups only.
 */
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
