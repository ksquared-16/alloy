import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** True when a task row represents operating-plan lifecycle work (not residual generic tasks). */
export function isOperatingPlanWorkIntentTask(
    task: InquirySummaryTaskPreviewRow,
    currentStageKey: string | null,
    primaryWorkIntentKey?: string | null,
): boolean {
    const workIntentKey = trimOrNull(task.work_intent_key);
    const stageKey = trimOrNull(task.lifecycle_stage_key);
    const primaryKey = trimOrNull(primaryWorkIntentKey);

    if (workIntentKey && primaryKey && workIntentKey === primaryKey) return true;
    if (workIntentKey) return true;

    if (task.lifecycle_provenance === "lifecycle_template") return true;

    if (stageKey && currentStageKey && stageKey === currentStageKey) {
        if (task.lifecycle_provenance === "lifecycle_template") return true;
        if (workIntentKey) return true;
    }

    return false;
}
