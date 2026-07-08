import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type {
    StageWorkItemProjection,
    StageWorkOutcomeAutomationPreview,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";

/** Strip runtime jargon (e.g. Reopen:) from operator-facing outcome effect copy. */
export function normalizeOperatorOutcomeEffectLabel(effect: string): string {
    const trimmed = effect.trim();
    const reopenMatch = /^Reopen:\s*(.+)$/i.exec(trimmed);
    if (reopenMatch) {
        const target = reopenMatch[1].trim();
        return target.toLowerCase().endsWith(" work") ? `Continue ${target}` : `Continue ${target} work`;
    }
    return trimmed;
}

/**
 * Operator-facing effect summary for a selected stage-work outcome.
 * Derives from automation preview + outcome `successful` flag — never invents
 * a close line when the outcome is a retry / stay-open record.
 */
export function stageWorkOutcomeEffectLines(
    item: StageWorkItemProjection,
    outcomeKey: string,
): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const preview of item.outcome_automation_preview) {
        if (preview.outcome_key !== outcomeKey) continue;
        const label = normalizeOperatorOutcomeEffectLabel(preview.effect_label);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        lines.push(label);
    }

    if (item.state !== "open") return lines;

    const outcome = item.outcomes.find((row) => row.outcome_key === outcomeKey);
    const previewSaysClose = lines.some((line) => /\bclose\b/i.test(line));
    if (outcome?.successful === true || previewSaysClose) {
        if (!previewSaysClose) lines.push("Close current work item");
        return lines;
    }

    const workLabel = item.label.trim();
    lines.push(workLabel ? `Continue ${workLabel} work` : "Keep open · record attempt");
    return lines;
}

export function stageWorkOutcomeEffectSummary(
    previews: StageWorkOutcomeAutomationPreview[],
    outcomeKey: string,
): string | null {
    const match = previews.find((row) => row.outcome_key === outcomeKey);
    const raw = match?.effect_label?.trim();
    return raw ? normalizeOperatorOutcomeEffectLabel(raw) : null;
}

/**
 * One-line effect for outcome picker rows — always returns copy so rows stay
 * the same height (label left, effect right).
 */
export function formatStageWorkOutcomeEffectForPicker(args: {
    previews: StageWorkOutcomeAutomationPreview[];
    outcomeKey: string;
    outcomes: StageCompletionOutcomeV1[];
    workTitle?: string | null;
}): string {
    const fromPreview = stageWorkOutcomeEffectSummary(args.previews, args.outcomeKey);
    if (fromPreview) return fromPreview;

    const outcome = args.outcomes.find((row) => row.outcome_key === args.outcomeKey);
    if (outcome?.successful === true) return "Complete this work item";

    const work = args.workTitle?.trim();
    if (work) return `Continue ${work} work`;
    return "Keep open · record attempt";
}

/** True when an open work item has at least one configured completion outcome. */
export function hasConfiguredCompletionOutcomes(item: StageWorkItemProjection | null): boolean {
    return Boolean(item && item.state === "open" && completionOutcomesForPicker(item).length > 0);
}

/**
 * Completion outcomes for the picker — same list the stage runtime attaches to the
 * open work item (`projectStageWorkRuntime` → `outcomesForTemplate`). Effect subtitles
 * come from `outcome_automation_preview`; missing preview does not hide a configured outcome.
 */
export function completionOutcomesForPicker(
    item: StageWorkItemProjection,
): StageCompletionOutcomeV1[] {
    return item.outcomes;
}
