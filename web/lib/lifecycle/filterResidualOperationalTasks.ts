import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

/** Remove lifecycle work-intent rows from generic task previews. */
export function filterResidualOperationalTasks(
    preview: InquirySummaryTaskPreviewPayload,
    workIntentRuntime: WorkIntentRuntimeProjection | null,
): InquirySummaryTaskPreviewPayload {
    const stageKey = workIntentRuntime?.stage_key ?? null;
    const primaryWorkIntentKey = workIntentRuntime?.work_intent_key ?? null;
    const workId = workIntentRuntime?.work_id ?? null;

    const open_tasks = preview.open_tasks.filter((task) => {
        if (workId && task.id === workId) return false;
        return !isOperatingPlanWorkIntentTask(task, stageKey, primaryWorkIntentKey);
    });

    return {
        state: "loaded",
        open_tasks,
        open_count: open_tasks.length,
    };
}
