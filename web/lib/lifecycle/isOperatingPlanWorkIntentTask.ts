import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** True when a task row represents operating-plan lifecycle work (not residual follow-ups). */
export function isOperatingPlanWorkIntentTask(
    task: InquirySummaryTaskPreviewRow,
    currentStageKey: string | null,
    stageTemplateKeys: readonly string[] = [],
): boolean {
    const workIntentKey = trimOrNull(task.work_intent_key);
    const stageKey = trimOrNull(task.lifecycle_stage_key);
    const templateKeys = stageTemplateKeys.map((k) => k.trim()).filter(Boolean);

    if (workIntentKey && templateKeys.includes(workIntentKey)) return true;
    if (workIntentKey && templateKeys.length === 0) return true;

    if (task.lifecycle_provenance === "lifecycle_template") {
        if (stageKey && currentStageKey && stageKey === currentStageKey) return true;
        if (!stageKey && templateKeys.length === 0) return true;
    }

    if (stageKey && currentStageKey && stageKey === currentStageKey && workIntentKey) {
        return true;
    }

    return false;
}
