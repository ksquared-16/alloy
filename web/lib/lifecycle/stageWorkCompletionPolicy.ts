/**
 * Completion policy helpers for stage_operating_plan_v1 work templates.
 */

import type { StageWorkCompletionPolicyV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

function finiteInt(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.max(0, Math.floor(value));
}

export function normalizeCompletionPolicy(
    raw: StageWorkCompletionPolicyV1 | null | undefined,
): StageWorkCompletionPolicyV1 | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const policy: StageWorkCompletionPolicyV1 = {};
    const min = finiteInt(raw.min_attempts);
    const max = finiteInt(raw.max_attempts);
    const window = finiteInt(raw.window_days);
    const repeatDue = finiteInt(raw.repeat_due_days);

    if (min != null && min > 0) policy.min_attempts = min;
    if (max != null && max > 0) policy.max_attempts = max;
    if (window != null && window > 0) policy.window_days = window;
    if (raw.repeat_until_outcome === true) policy.repeat_until_outcome = true;
    if (repeatDue != null && repeatDue > 0) policy.repeat_due_days = repeatDue;

    if (!Object.keys(policy).length) return undefined;
    if (policy.min_attempts != null && policy.max_attempts != null && policy.min_attempts > policy.max_attempts) {
        policy.max_attempts = policy.min_attempts;
    }
    return policy;
}

export function hasCompletionPolicy(policy: StageWorkCompletionPolicyV1 | null | undefined): boolean {
    return normalizeCompletionPolicy(policy) != null;
}

export function completionPolicySummary(
    policy: StageWorkCompletionPolicyV1 | null | undefined,
): string | null {
    const normalized = normalizeCompletionPolicy(policy);
    if (!normalized) return null;

    const parts: string[] = [];
    const min = normalized.min_attempts;
    const max = normalized.max_attempts ?? normalized.min_attempts;
    const window = normalized.window_days;

    if (min != null && max != null && min === max) {
        parts.push(`Requires ${min} attempt${min === 1 ? "" : "s"}`);
    } else if (min != null && max != null) {
        parts.push(`Requires ${min}–${max} attempts`);
    } else if (min != null) {
        parts.push(`Minimum ${min} attempt${min === 1 ? "" : "s"}`);
    } else if (max != null) {
        parts.push(`Maximum ${max} attempt${max === 1 ? "" : "s"}`);
    }

    if (window != null) {
        parts.push(`within ${window} day${window === 1 ? "" : "s"}`);
    }

    let summary = parts.join(" ");
    if (normalized.repeat_until_outcome && normalized.repeat_due_days != null) {
        const repeat = `Repeats every ${normalized.repeat_due_days} day${normalized.repeat_due_days === 1 ? "" : "s"} until resolved`;
        summary = summary ? `${summary}. ${repeat}` : repeat;
    } else if (normalized.repeat_until_outcome) {
        const repeat = "Repeats until resolved";
        summary = summary ? `${summary}. ${repeat}` : repeat;
    }

    return summary || null;
}

export function completionPolicyForWorkTemplate(
    template: Pick<StageWorkTemplateV1, "completion_policy"> | null | undefined,
): StageWorkCompletionPolicyV1 | undefined {
    return normalizeCompletionPolicy(template?.completion_policy);
}

export function shouldRepeatWorkAfterRetryOutcome(
    template: Pick<StageWorkTemplateV1, "completion_policy"> | null | undefined,
    attemptCount: number,
): { repeat: boolean; dueDays: number | null } {
    const policy = completionPolicyForWorkTemplate(template);
    if (!policy?.repeat_until_outcome) return { repeat: false, dueDays: null };

    const max = policy.max_attempts ?? policy.min_attempts;
    if (max != null && attemptCount >= max) return { repeat: false, dueDays: null };

    return { repeat: true, dueDays: policy.repeat_due_days ?? null };
}
