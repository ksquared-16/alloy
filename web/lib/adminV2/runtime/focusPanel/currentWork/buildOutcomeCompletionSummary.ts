import type { StageWorkItemProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

import { normalizeOperatorOutcomeEffectLabel } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

import type { CurrentWorkCompletionSummary } from "./currentWorkSurfaceTypes";

/**
 * Operator-facing outcome completion summary — no workflow debug language.
 */
export function buildOutcomeCompletionSummary(args: {
    workItem: StageWorkItemProjection;
    outcomeKey: string;
    effectLines: string[];
}): CurrentWorkCompletionSummary {
    const outcome = args.workItem.outcomes.find((row) => row.outcome_key === args.outcomeKey);
    const outcomeLabel = outcome?.label?.trim() ?? args.outcomeKey;
    const workTitle = args.workItem.label.trim();

    const normalizedEffects = args.effectLines.map(normalizeOperatorOutcomeEffectLabel);
    const changeLines = normalizedEffects.filter(
        (line) => !/^continue\b/i.test(line) || normalizedEffects.length === 1,
    );

    const continuesWork = normalizedEffects.some((line) => /^continue\b/i.test(line));
    const summary =
        continuesWork && !outcome?.successful
            ? "Current Work will continue."
            : outcome?.successful
              ? "This work item is complete."
              : "Outcome recorded.";

    const nextWorkLabel =
        continuesWork && workTitle ? workTitle : null;

    const reminderPreview = args.workItem.outcome_automation_preview.find(
        (row) => row.outcome_key === args.outcomeKey,
    );
    const nextReminderLabel =
        reminderPreview?.effect_label?.toLowerCase().includes("remind")
            ? normalizeOperatorOutcomeEffectLabel(reminderPreview.effect_label)
            : null;

    return {
        outcomeKey: args.outcomeKey,
        outcomeLabel,
        summary,
        changeLines: changeLines.length > 0 ? changeLines : [summary],
        nextWorkLabel,
        nextReminderLabel,
    };
}
