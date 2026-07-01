import type {
    StageWorkItemProjection,
    StageWorkOutcomeAutomationPreview,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";

/** Operator-facing effect summary for a selected stage-work outcome. */
export function stageWorkOutcomeEffectLines(
    item: StageWorkItemProjection,
    outcomeKey: string,
): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const preview of item.outcome_automation_preview) {
        if (preview.outcome_key !== outcomeKey) continue;
        const label = preview.effect_label.trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        lines.push(label);
    }

    if (item.state === "open") {
        lines.push("Close current work item");
    }

    return lines;
}

export function stageWorkOutcomeEffectSummary(
    previews: StageWorkOutcomeAutomationPreview[],
    outcomeKey: string,
): string | null {
    const match = previews.find((row) => row.outcome_key === outcomeKey);
    return match?.effect_label?.trim() || null;
}
