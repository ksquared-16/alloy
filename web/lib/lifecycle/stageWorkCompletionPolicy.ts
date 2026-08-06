/**
 * Completion policy helpers for stage_operating_plan_v1 work templates.
 */

import type {
    StageWorkCompletionPolicyV1,
    StageWorkSufficientCommandResultV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/** Capability identity the communications send path publishes results under. */
export const COMMUNICATIONS_SEND_CAPABILITY_KEY = "communications_send";

function finiteInt(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.max(0, Math.floor(value));
}

function normalizeSufficientCommandResults(
    raw: unknown,
): StageWorkSufficientCommandResultV1[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: StageWorkSufficientCommandResultV1[] = [];
    for (const entry of raw) {
        if (entry == null || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        const capability = typeof e.capability === "string" ? e.capability.trim() : "";
        const result = typeof e.result === "string" ? e.result.trim() : "";
        const satisfies =
            typeof e.satisfies_outcome_key === "string" ? e.satisfies_outcome_key.trim() : "";
        if (!capability || !result || !satisfies) continue;
        out.push({ capability, result, satisfies_outcome_key: satisfies });
    }
    return out.length ? out : undefined;
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
    if ((raw as { requires_all_participants_resolved?: unknown }).requires_all_participants_resolved === true) {
        policy.requires_all_participants_resolved = true;
    }
    const sufficient = normalizeSufficientCommandResults(
        (raw as { sufficient_command_results?: unknown }).sufficient_command_results,
    );
    if (sufficient) policy.sufficient_command_results = sufficient;

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

/**
 * Platform-owned default command-result sufficiency for recognized canonical work templates.
 * Operators never see these runtime result keys — they are engine vocabulary only.
 * Explicit `completion_policy.sufficient_command_results` on a work template always wins.
 */
export const PLATFORM_DEFAULT_SUFFICIENT_COMMAND_RESULTS: Readonly<
    Record<string, readonly StageWorkSufficientCommandResultV1[]>
> = {
    contact_family: [
        {
            capability: COMMUNICATIONS_SEND_CAPABILITY_KEY,
            result: "sent",
            satisfies_outcome_key: "left_message",
        },
        {
            capability: "schedule_tour",
            result: "confirmed",
            satisfies_outcome_key: "tour_scheduled",
        },
    ],
};

function canonicalWorkTemplateKey(
    template:
        | Partial<Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">>
        | null
        | undefined,
): string | null {
    if (!template) return null;
    const fromDef = typeof template.work_definition_key === "string" ? template.work_definition_key.trim() : "";
    if (fromDef) return fromDef;
    const fromKey = typeof template.template_key === "string" ? template.template_key.trim() : "";
    return fromKey || null;
}

/** True when the template authors an explicit sufficient_command_results list. */
export function hasExplicitSufficientCommandResults(
    template: Pick<StageWorkTemplateV1, "completion_policy"> | null | undefined,
): boolean {
    const entries = completionPolicyForWorkTemplate(template)?.sufficient_command_results;
    return Boolean(entries?.length);
}

/**
 * Resolve the authored outcome that an objective capability result satisfies for a
 * work template (R2). Returns null when configuration does not declare this result
 * sufficient — in which case a successful command must NOT auto-complete the work.
 * Keyed on the objective result, so a "failed" result can never resolve a "sent"
 * mapping, and an operator declaration can never arrive through this path.
 */
export function resolveSufficientCommandResultOutcome(
    template: Pick<StageWorkTemplateV1, "completion_policy"> | null | undefined,
    capability: string,
    result: string,
): string | null {
    const policy = completionPolicyForWorkTemplate(template);
    const entries = policy?.sufficient_command_results;
    if (!entries?.length) return null;
    const cap = capability.trim();
    const res = result.trim();
    if (!cap || !res) return null;
    for (const entry of entries) {
        if (entry.capability === cap && entry.result === res) {
            return entry.satisfies_outcome_key;
        }
    }
    return null;
}

/**
 * Effective sufficiency resolution (product decision, July 2026):
 * 1. Explicit work-item `sufficient_command_results` wins (including reply-required overrides).
 * 2. Else platform default for recognized canonical templates (e.g. contact_family).
 * 3. Else no inference — unknown/custom work never auto-completes from a send.
 */
export function resolveEffectiveSufficientCommandResultOutcome(
    template:
        | (Pick<StageWorkTemplateV1, "completion_policy"> &
              Partial<Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">>)
        | null
        | undefined,
    capability: string,
    result: string,
): string | null {
    if (hasExplicitSufficientCommandResults(template)) {
        return resolveSufficientCommandResultOutcome(template, capability, result);
    }

    const canonicalKey = canonicalWorkTemplateKey(template);
    const defaults = canonicalKey ? PLATFORM_DEFAULT_SUFFICIENT_COMMAND_RESULTS[canonicalKey] : undefined;
    if (!defaults?.length) return null;

    return resolveSufficientCommandResultOutcome(
        { completion_policy: { sufficient_command_results: [...defaults] } },
        capability,
        result,
    );
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
