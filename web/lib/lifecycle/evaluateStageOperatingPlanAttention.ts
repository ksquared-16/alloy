/**
 * Pure evaluator for stage_operating_plan_v1.attention_rules (MVP rule kinds).
 */

import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { completionPolicyForWorkTemplate } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { normalizeAttentionRuleKind } from "@/lib/lifecycle/stageAttentionRuleCatalog";
import type {
    StageAttentionRuleV1,
    StageAttentionSeverity,
    StageOperatingPlanV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    projectReadinessToAttentionReasons,
} from "@/lib/opportunities/readinessAttentionProjection";
import type { ReadinessAttentionProjectionProfileV1 } from "@/lib/opportunities/readinessAttentionProjectionProfile";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StageAttentionTaskSnapshot = {
    template_key: string | null;
    work_intent_key: string | null;
    due_at: string | null;
    status: string;
    attempt_count: number;
    lifecycle_stage_key: string | null;
    created_at?: string | null;
};

export type StageAttentionEvalKind =
    | "work_overdue"
    | "stage_age_exceeded"
    | "missing_required_fields"
    | "attempts_incomplete";

export type StageAttentionFiredRule = {
    rule_key: string;
    kind: StageAttentionEvalKind;
    label: string;
    severity: StageAttentionSeverity;
    provenance: string;
};

export type StageAttentionEvaluationInput = {
    plan: StageOperatingPlanV1;
    builderStageKey: string;
    nowMs: number;
    stageEnteredMs: number;
    tasks: StageAttentionTaskSnapshot[];
    readiness?: ReadinessResult | null;
    readinessProfile?: ReadinessAttentionProjectionProfileV1 | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function finiteDays(raw: unknown, fallback: number): number {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
    return Math.max(0, Math.floor(raw));
}

function normalizeEvalKind(kind: StageAttentionRuleV1["kind"]): StageAttentionEvalKind | null {
    const normalized = normalizeAttentionRuleKind(kind);
    switch (normalized) {
        case "work_overdue":
        case "required_work_overdue":
            return "work_overdue";
        case "stage_age_exceeded":
        case "days_without_success":
            return "stage_age_exceeded";
        case "missing_required_fields":
            return "missing_required_fields";
        case "no_contact_attempt":
        case "tasks_without_success":
            return "attempts_incomplete";
        default:
            return null;
    }
}

function taskMatchesTemplate(
    task: StageAttentionTaskSnapshot,
    templateKey: string | null,
    builderStageKey: string,
): boolean {
    if (templateKey) {
        const tk = trimOrNull(task.template_key);
        if (tk === templateKey) return true;
    }
    const stage = trimOrNull(task.lifecycle_stage_key);
    if (stage && stage !== builderStageKey) return false;
    if (!templateKey) return stage === builderStageKey;
    return false;
}

function openTasksForRule(
    tasks: StageAttentionTaskSnapshot[],
    templateKey: string | null,
    builderStageKey: string,
): StageAttentionTaskSnapshot[] {
    return tasks.filter(
        (t) => t.status === "open" && taskMatchesTemplate(t, templateKey, builderStageKey),
    );
}

function maxAttemptCountForRule(
    tasks: StageAttentionTaskSnapshot[],
    templateKey: string | null,
    builderStageKey: string,
): number {
    const matching = tasks.filter((t) => taskMatchesTemplate(t, templateKey, builderStageKey));
    if (!matching.length) return 0;
    return Math.max(...matching.map((t) => t.attempt_count));
}

function evaluateWorkOverdue(
    rule: StageAttentionRuleV1,
    input: StageAttentionEvaluationInput,
): boolean {
    const templateKey = trimOrNull(rule.template_key);
    const thresholdDays = finiteDays(rule.threshold, 1);
    const thresholdMs = thresholdDays * MS_PER_DAY;
    const matching = openTasksForRule(input.tasks, templateKey, input.builderStageKey);
    for (const task of matching) {
        if (!task.due_at) continue;
        const dueMs = Date.parse(task.due_at);
        if (!Number.isFinite(dueMs)) continue;
        if (input.nowMs >= dueMs + thresholdMs) return true;
    }
    return false;
}

function evaluateStageAge(rule: StageAttentionRuleV1, input: StageAttentionEvaluationInput): boolean {
    const thresholdDays = finiteDays(rule.threshold, 7);
    const thresholdMs = thresholdDays * MS_PER_DAY;
    return input.nowMs - input.stageEnteredMs >= thresholdMs;
}

function evaluateMissingRequiredFields(
    rule: StageAttentionRuleV1,
    input: StageAttentionEvaluationInput,
): boolean {
    if (!input.readiness || !input.readinessProfile) return false;
    const projected = projectReadinessToAttentionReasons(input.readiness, input.readinessProfile);
    return projected.length > 0;
}

function evaluateAttemptsIncomplete(
    rule: StageAttentionRuleV1,
    input: StageAttentionEvaluationInput,
): boolean {
    const templateKey = trimOrNull(rule.template_key);
    const template = templateKey
        ? input.plan.work_templates.find((t) => t.template_key === templateKey) ?? null
        : null;
    const policy = completionPolicyForWorkTemplate(template);
    const minAttempts = finiteDays(rule.threshold, policy?.min_attempts ?? 1);
    const windowDays = finiteDays(policy?.window_days, 7);
    const windowMs = windowDays * MS_PER_DAY;

    if (input.nowMs - input.stageEnteredMs < windowMs) return false;

    const attemptCount = maxAttemptCountForRule(input.tasks, templateKey, input.builderStageKey);
    return attemptCount < minAttempts;
}

function labelForRule(rule: StageAttentionRuleV1, input: StageAttentionEvaluationInput, evalKind: StageAttentionEvalKind): string {
    const custom = trimOrNull(rule.label);
    if (custom) return custom;

    const targetReason = rule.targets.find((t) => t.kind === "create_needs_attention")?.attention_reason;
    const fromTarget = trimOrNull(targetReason);
    if (fromTarget) return fromTarget;

    if (evalKind === "missing_required_fields" && input.readiness && input.readinessProfile) {
        const projected = projectReadinessToAttentionReasons(input.readiness, input.readinessProfile);
        if (projected[0]?.label) return projected[0].label;
    }

    return rule.rule_key.replace(/_/g, " ");
}

function severityForRule(rule: StageAttentionRuleV1): StageAttentionSeverity {
    return rule.severity ?? "medium";
}

/**
 * Evaluate configured stage attention rules; returns zero or more fired rules.
 */
export function evaluateStageOperatingPlanAttention(
    input: StageAttentionEvaluationInput,
): StageAttentionFiredRule[] {
    if (!input.plan.attention_rules.length) return [];

    const fired: StageAttentionFiredRule[] = [];
    for (const rule of input.plan.attention_rules) {
        const evalKind = normalizeEvalKind(rule.kind);
        if (!evalKind) continue;

        let matches = false;
        switch (evalKind) {
            case "work_overdue":
                matches = evaluateWorkOverdue(rule, input);
                break;
            case "stage_age_exceeded":
                matches = evaluateStageAge(rule, input);
                break;
            case "missing_required_fields":
                matches = evaluateMissingRequiredFields(rule, input);
                break;
            case "attempts_incomplete":
                matches = evaluateAttemptsIncomplete(rule, input);
                break;
            default:
                break;
        }

        if (!matches) continue;

        fired.push({
            rule_key: rule.rule_key,
            kind: evalKind,
            label: labelForRule(rule, input, evalKind),
            severity: severityForRule(rule),
            provenance: `stage_operating_plan_v1:${input.builderStageKey}:${rule.rule_key}`,
        });
    }

    return fired;
}

/** Map operational_tasks row → evaluator task snapshot. */
export function operationalTaskRowToStageAttentionSnapshot(row: {
    due_at?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
}): StageAttentionTaskSnapshot {
    const md = row.metadata ?? {};
    const rawAttempts = md.attempt_count;
    const attempt_count =
        typeof rawAttempts === "number" && Number.isFinite(rawAttempts)
            ? Math.max(0, Math.floor(rawAttempts))
            : 0;

    return {
        template_key: trimOrNull(md.operating_plan_template_key),
        work_intent_key: trimOrNull(md.work_intent_key),
        due_at: row.due_at ?? null,
        status: String(row.status ?? "open"),
        attempt_count,
        lifecycle_stage_key: trimOrNull(md.lifecycle_stage_key),
        created_at: row.created_at ?? null,
    };
}
