/**
 * Shared elapsed-time threshold helpers for stage attention rules.
 */

import { durationOffsetToMs, type StageFollowUpDueOffsetUnit } from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
import { normalizeAttentionRuleKind } from "@/lib/lifecycle/stageAttentionRuleCatalog";
import type {
    StageAttentionRuleKind,
    StageAttentionRuleV1,
    StageAttentionThresholdDurationV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

const ELAPSED_TIME_KINDS = new Set<StageAttentionRuleKind>([
    "work_overdue",
    "required_work_overdue",
    "stage_age_exceeded",
    "days_without_success",
    "waiting_on_family",
    "waiting_on_provider",
]);

export function attentionRuleUsesElapsedTime(kind: StageAttentionRuleKind): boolean {
    return ELAPSED_TIME_KINDS.has(normalizeAttentionRuleKind(kind));
}

export function normalizeAttentionThresholdDuration(
    rule: Pick<StageAttentionRuleV1, "kind" | "threshold" | "threshold_duration">,
    fallbackDays = 1,
): StageAttentionThresholdDurationV1 {
    if (rule.threshold_duration) {
        return {
            offset_value: Math.max(0, Math.floor(rule.threshold_duration.offset_value)),
            offset_unit: rule.threshold_duration.offset_unit ?? "days",
        };
    }
    const days =
        typeof rule.threshold === "number" && Number.isFinite(rule.threshold) ?
            Math.max(0, Math.floor(rule.threshold))
        :   fallbackDays;
    return { offset_value: days, offset_unit: "days" };
}

export function attentionThresholdDurationToMs(
    duration: StageAttentionThresholdDurationV1,
): number {
    return durationOffsetToMs(duration.offset_value, duration.offset_unit);
}

/** Day-equivalent for legacy `threshold` mirroring after explicit edits. */
export function attentionDurationLegacyDayMirror(
    duration: StageAttentionThresholdDurationV1,
): number | undefined {
    if (duration.offset_unit !== "days") return undefined;
    return duration.offset_value;
}

export function formatAttentionThresholdDuration(
    duration: StageAttentionThresholdDurationV1,
): string {
    const value = duration.offset_value;
    const unit = duration.offset_unit;
    const unitLabel =
        value === 1 ?
            unit === "minutes" ? "minute"
            : unit === "hours" ? "hour"
            : unit === "days" ? "day"
            : unit === "weeks" ? "week"
            : "month"
        : unit;
    return `${value} ${unitLabel}`;
}

export type AttentionDurationUi = {
    offset_value: number;
    offset_unit: StageFollowUpDueOffsetUnit;
};
