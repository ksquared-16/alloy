/**
 * Outcome automation editor model — maps between operator-friendly controls and outcome_rules[].
 */

import type {
    StageOperatingPlanV1,
    StageOutcomeRuleTargetV1,
    StageOutcomeRuleV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { outcomeAutomationSummaries } from "@/lib/lifecycle/stageOperatingPlanConvergence";

export type OutcomeAutomationKind =
    | "none"
    | "stay_in_stage"
    | "move_to_stage"
    | "close_record"
    | "repeat_work"
    | "mark_needs_attention";

export type OutcomeAutomationDraft = {
    kind: OutcomeAutomationKind;
    stage_key?: string;
    status_key?: string;
    repeat_template_key?: string;
    repeat_due_days?: number;
    attention_reason?: string;
    attention_severity?: "low" | "medium" | "high";
    /** Optional attempt gate for repeat vs attention branching. */
    when_attempt_count_lt?: number;
    when_attempt_count_gte?: number;
};

const ENROLLMENT_STAGE_DEFAULT_STATUS: Record<string, string> = {
    lead: "new_lead",
    new_lead: "new_lead",
    qualification: "open",
    tour: "open",
    enrolling: "open",
    enrolled: "enrolled",
    waitlist: "waitlisted",
    decision: "open",
    closed: "closed",
    closed_withdrawn: "closed",
};

export function defaultStatusKeyForStage(stageKey: string): string {
    const key = stageKey.trim().toLowerCase();
    return ENROLLMENT_STAGE_DEFAULT_STATUS[key] ?? "open";
}

function trimKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t || null;
}

function rulesForOutcome(rules: StageOutcomeRuleV1[], outcomeKey: string): StageOutcomeRuleV1[] {
    return rules.filter((r) => (r.when_outcome_key ?? "").trim() === outcomeKey.trim());
}

function detectAutomationKind(targets: StageOutcomeRuleTargetV1[]): OutcomeAutomationKind {
    if (!targets.length) return "none";

    const kinds = new Set(targets.map((t) => t.kind));
    if (kinds.has("create_needs_attention") && !kinds.has("reopen_work") && !kinds.has("create_next_work")) {
        return "mark_needs_attention";
    }
    if (kinds.has("reopen_work") || kinds.has("create_next_work")) return "repeat_work";
    if (kinds.has("update_family_case_status") && targets.some((t) => trimKey(t.status_key) === "closed")) {
        return "close_record";
    }
    if (kinds.has("move_to_stage") || kinds.has("update_family_case_status")) return "move_to_stage";
    if (kinds.has("no_movement")) return "stay_in_stage";
    return "none";
}

export function readOutcomeAutomationDraft(
    outcomeKey: string,
    rules: StageOutcomeRuleV1[],
    options?: { preferAttemptGte?: boolean },
): OutcomeAutomationDraft {
    const matching = rulesForOutcome(rules, outcomeKey);
    if (!matching.length) return { kind: "none" };

    let rule = matching[0]!;
    if (options?.preferAttemptGte) {
        rule =
            matching.find((r) => r.when_attempt_count_gte != null) ??
            matching.find((r) => r.when_attempt_count_lt != null) ??
            rule;
    }

    const kind = detectAutomationKind(rule.targets);
    const draft: OutcomeAutomationDraft = { kind };

    if (rule.when_attempt_count_lt != null) draft.when_attempt_count_lt = rule.when_attempt_count_lt;
    if (rule.when_attempt_count_gte != null) draft.when_attempt_count_gte = rule.when_attempt_count_gte;

    for (const target of rule.targets) {
        if (target.kind === "move_to_stage" && target.stage_key) draft.stage_key = target.stage_key;
        if (target.kind === "update_family_case_status" && target.status_key) {
            draft.status_key = target.status_key;
        }
        if ((target.kind === "reopen_work" || target.kind === "create_next_work") && target.template_key) {
            draft.repeat_template_key = target.template_key;
        }
        if (
            (target.kind === "reopen_work" || target.kind === "create_next_work") &&
            typeof target.due_days === "number"
        ) {
            draft.repeat_due_days = target.due_days;
        }
        if (target.kind === "create_needs_attention") {
            draft.attention_reason = target.attention_reason ?? undefined;
        }
    }

    if (kind === "move_to_stage" && !draft.status_key && draft.stage_key) {
        draft.status_key = defaultStatusKeyForStage(draft.stage_key);
    }

    return draft;
}

export function outcomeAutomationSummaryForOutcome(
    outcomeKey: string,
    outcomeLabel: string,
    rules: StageOutcomeRuleV1[],
    options?: { workTemplateLabelByKey?: Record<string, string> },
): string {
    const lines = outcomeAutomationSummaries(outcomeKey, rules, options);
    if (!lines.length) return "No automation attached";
    return `${outcomeLabel} → ${lines.join(" · ")}`;
}

export function buildOutcomeRuleFromAutomation(
    outcomeKey: string,
    draft: OutcomeAutomationDraft,
    index: number,
): StageOutcomeRuleV1 | null {
    if (draft.kind === "none") return null;

    const rule_key = `${outcomeKey}_automation_${index + 1}`;
    const targets: StageOutcomeRuleTargetV1[] = [];

    switch (draft.kind) {
        case "stay_in_stage":
            targets.push({ kind: "no_movement" });
            break;
        case "move_to_stage": {
            const stageKey = trimKey(draft.stage_key);
            if (!stageKey) return null;
            const statusKey = trimKey(draft.status_key) ?? defaultStatusKeyForStage(stageKey);
            targets.push({ kind: "update_family_case_status", status_key: statusKey });
            targets.push({ kind: "move_to_stage", stage_key: stageKey });
            targets.push({ kind: "mark_stage_work_complete" });
            break;
        }
        case "close_record": {
            const statusKey = trimKey(draft.status_key) ?? "closed";
            targets.push({ kind: "update_family_case_status", status_key: statusKey });
            targets.push({ kind: "mark_stage_work_complete" });
            break;
        }
        case "repeat_work": {
            const templateKey = trimKey(draft.repeat_template_key);
            if (!templateKey) return null;
            const dueDays =
                typeof draft.repeat_due_days === "number" && Number.isFinite(draft.repeat_due_days) ?
                    Math.max(0, Math.floor(draft.repeat_due_days))
                :   1;
            targets.push({ kind: "reopen_work", template_key: templateKey, due_days: dueDays });
            break;
        }
        case "mark_needs_attention":
            targets.push({
                kind: "create_needs_attention",
                attention_reason: trimKey(draft.attention_reason) ?? "Needs attention",
                wait_bucket: "waiting_on_staff",
            });
            break;
        default:
            return null;
    }

    const rule: StageOutcomeRuleV1 = { rule_key, when_outcome_key: outcomeKey, targets };
    if (draft.when_attempt_count_lt != null) rule.when_attempt_count_lt = draft.when_attempt_count_lt;
    if (draft.when_attempt_count_gte != null) rule.when_attempt_count_gte = draft.when_attempt_count_gte;
    return rule;
}

export function upsertOutcomeAutomationRule(
    rules: StageOutcomeRuleV1[],
    outcomeKey: string,
    draft: OutcomeAutomationDraft,
): StageOutcomeRuleV1[] {
    const without = rules.filter((r) => r.when_outcome_key !== outcomeKey);
    const built = buildOutcomeRuleFromAutomation(outcomeKey, draft, without.length);
    if (!built) return without;
    return [...without, built];
}

export function upsertAttemptConditionalOutcomeRules(
    rules: StageOutcomeRuleV1[],
    outcomeKey: string,
    belowMax: OutcomeAutomationDraft,
    atOrAboveMax: OutcomeAutomationDraft,
    maxAttempts: number,
): StageOutcomeRuleV1[] {
    const without = rules.filter((r) => r.when_outcome_key !== outcomeKey);
    const next = [...without];

    const repeatRule = buildOutcomeRuleFromAutomation(
        outcomeKey,
        { ...belowMax, when_attempt_count_lt: maxAttempts },
        next.length,
    );
    if (repeatRule) next.push(repeatRule);

    const terminalRule = buildOutcomeRuleFromAutomation(
        outcomeKey,
        { ...atOrAboveMax, when_attempt_count_gte: maxAttempts },
        next.length,
    );
    if (terminalRule) next.push(terminalRule);

    return next;
}

export function enrollmentStageOptions(): Array<{ key: string; label: string }> {
    return [
        { key: "lead", label: "Lead" },
        { key: "qualification", label: "Qualification" },
        { key: "tour", label: "Tour" },
        { key: "enrolling", label: "Enrolling" },
        { key: "enrolled", label: "Enrolled" },
        { key: "waitlist", label: "Waitlist" },
        { key: "closed", label: "Closed" },
    ];
}

export function workTemplateOptions(templates: StageWorkTemplateV1[]): Array<{ key: string; label: string }> {
    return templates.map((t) => ({ key: t.template_key, label: t.label }));
}

export type OutcomeAutomationEditorOption = {
    value: OutcomeAutomationKind;
    label: string;
};

export const OUTCOME_AUTOMATION_OPTIONS: OutcomeAutomationEditorOption[] = [
    { value: "none", label: "No automation" },
    { value: "stay_in_stage", label: "Stay in stage" },
    { value: "move_to_stage", label: "Move to stage/status" },
    { value: "close_record", label: "Close record" },
    { value: "repeat_work", label: "Repeat work item" },
    { value: "mark_needs_attention", label: "Mark needs attention" },
];

export function normalizeOutcomeRulesOnPersist(
    rules: StageOutcomeRuleV1[],
    outcomes: StageOperatingPlanV1["outcomes"],
): StageOutcomeRuleV1[] {
    const outcomeKeys = new Set(outcomes.map((o) => o.outcome_key));
    return rules.filter(
        (r) =>
            Boolean((r.when_enter_status_key ?? "").trim()) ||
            Boolean(r.when_domain_signal?.domain && r.when_domain_signal?.signal) ||
            outcomeKeys.has((r.when_outcome_key ?? "").trim()),
    );
}
