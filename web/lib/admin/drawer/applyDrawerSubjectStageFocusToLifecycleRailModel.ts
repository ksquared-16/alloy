import type { RecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";

function normalizeStageToken(value: string): string {
    return value.trim().toLowerCase().replace(/[_\s-]+/g, "");
}

function stageKeyMatchesStep(stepKey: string, stageFocusKey: string): boolean {
    const stepNorm = normalizeStageToken(stepKey);
    const focusNorm = normalizeStageToken(stageFocusKey);
    if (!stepNorm || !focusNorm) return false;
    if (stepNorm === focusNorm) return true;
    if (stepNorm.startsWith(focusNorm) || focusNorm.startsWith(stepNorm)) return true;
    return false;
}

/** Shift lifecycle rail "current" step to queue row stage focus when subject context requests it. */
export function applyDrawerSubjectStageFocusToLifecycleRailModel(
    model: RecordLifecycleRailModel | null | undefined,
    stageFocusKey: string | null | undefined,
): RecordLifecycleRailModel | null {
    if (!model?.steps.length) return model ?? null;
    const focus = stageFocusKey?.trim();
    if (!focus) return model;

    const focusIndex = model.steps.findIndex((step) => stageKeyMatchesStep(step.key, focus));
    if (focusIndex < 0) return model;

    const steps = model.steps.map((step, index) => {
        let state: "complete" | "current" | "future" | "unknown" = "future";
        if (focusIndex < 0) state = "unknown";
        else if (index < focusIndex) state = "complete";
        else if (index === focusIndex) state = "current";
        return { ...step, state };
    });

    return { steps, currentIndex: focusIndex };
}
