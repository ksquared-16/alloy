/**
 * Stage-runtime-only Current Work projection for queue rows and other preview surfaces.
 * Keeps queue + card language aligned without duplicating business rules.
 */

import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

import { formatCurrentWorkProgress } from "./projectCurrentWork";

export { formatCurrentWorkProgress };

export type StageRuntimeCurrentWorkPreview = {
    title: string;
    progressLabel: string | null;
    blockerHint: string | null;
};

/** Lightweight projection when only `_stage_work_runtime` is available (queue preview). */
export function projectCurrentWorkFromStageRuntime(
    runtime: StageWorkRuntimeProjection | null | undefined,
): StageRuntimeCurrentWorkPreview {
    if (!runtime) {
        return { title: "No open work", progressLabel: null, blockerHint: null };
    }

    const items = [runtime.primary, ...runtime.additional].filter(Boolean);
    const total = items.length;
    const completed = items.filter((item) => item!.state === "completed").length;
    const open =
        items.find((item) => item!.state === "open")
        ?? items.find((item) => item!.state === "planned")
        ?? runtime.primary;

    return {
        title: open?.label?.trim() || runtime.stage_label?.trim() || "Current work",
        progressLabel: formatCurrentWorkProgress(completed, total),
        blockerHint: null,
    };
}
