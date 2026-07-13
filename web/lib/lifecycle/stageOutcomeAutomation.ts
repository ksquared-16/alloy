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
import {
    effectiveFollowUpDuePolicy,
    formatFollowUpDuePolicySummary,
    type StageFollowUpDueAnchor,
    type StageFollowUpWorkDuePolicyV1,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
import {
    readTransitionRefFromTarget,
    resolveLegacyStageKeyToTransitionRef,
    resolveStageOutcomeTransitionOptions,
    stageKeyFromTransitionRef,
    type StageOutcomeTransitionOption,
} from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";

export type OutcomeAutomationKind =
    | "none"
    | "stay_in_stage"
    | "move_to_stage"
    | "close_record"
    | "repeat_work"
    | "mark_needs_attention";

export type OutcomeAutomationDraft = {
    kind: OutcomeAutomationKind;
    /** Canonical transition ref for move_to_stage — preferred over stage_key. */
    transition_ref?: string;
    stage_key?: string;
    status_key?: string;
    repeat_template_key?: string;
    repeat_due_days?: number;
    follow_up_due_policy?: StageFollowUpWorkDuePolicyV1;
    attention_reason?: string;
    attention_severity?: "low" | "medium" | "high";
    /** When true, recording this outcome completes the active work item. */
    completes_work?: boolean;
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

function readFollowUpTarget(targets: StageOutcomeRuleTargetV1[]): StageOutcomeRuleTargetV1 | null {
    return (
        targets.find((t) => t.kind === "create_next_work")
        ?? targets.find((t) => t.kind === "reopen_work")
        ?? null
    );
}

export function readOutcomeAutomationDraft(
    outcomeKey: string,
    rules: StageOutcomeRuleV1[],
    options?: {
        preferAttemptGte?: boolean;
        transitionOptions?: StageOutcomeTransitionOption[];
    },
): OutcomeAutomationDraft {
    const matching = rulesForOutcome(rules, outcomeKey);
    if (!matching.length) return { kind: "none" };

    let rule = matching[0]!;
    if (options?.preferAttemptGte) {
        rule =
            matching.find((r) => r.when_attempt_count_gte != null)
            ?? matching.find((r) => r.when_attempt_count_lt != null)
            ?? rule;
    }

    const kind = detectAutomationKind(rule.targets);
    const draft: OutcomeAutomationDraft = { kind };

    if (rule.when_attempt_count_lt != null) draft.when_attempt_count_lt = rule.when_attempt_count_lt;
    if (rule.when_attempt_count_gte != null) draft.when_attempt_count_gte = rule.when_attempt_count_gte;

    const transitionOptions = options?.transitionOptions ?? [];

    for (const target of rule.targets) {
        if (target.kind === "move_to_stage") {
            const transitionRef = readTransitionRefFromTarget(target, transitionOptions);
            if (transitionRef) draft.transition_ref = transitionRef;
            if (target.stage_key) draft.stage_key = target.stage_key;
        }
        if (target.kind === "update_family_case_status" && target.status_key) {
            draft.status_key = target.status_key;
        }
        const followUp = readFollowUpTarget(rule.targets);
        if (followUp && (target.kind === "reopen_work" || target.kind === "create_next_work")) {
            if (target.template_key) draft.repeat_template_key = target.template_key;
            if (target.follow_up_due_policy) draft.follow_up_due_policy = target.follow_up_due_policy;
            if (typeof target.due_days === "number") draft.repeat_due_days = target.due_days;
        }
        if (target.kind === "create_needs_attention") {
            draft.attention_reason = target.attention_reason ?? undefined;
        }
        if (target.kind === "mark_stage_work_complete") {
            draft.completes_work = true;
        }
    }

    if (kind === "move_to_stage") {
        if (!draft.transition_ref && draft.stage_key) {
            const legacy = resolveLegacyStageKeyToTransitionRef(draft.stage_key, transitionOptions);
            if (legacy.transition_ref) draft.transition_ref = legacy.transition_ref;
        }
        if (!draft.status_key) {
            const stageKey =
                stageKeyFromTransitionRef(draft.transition_ref, transitionOptions)
                ?? draft.stage_key;
            if (stageKey) draft.status_key = defaultStatusKeyForStage(stageKey);
        }
    }

    if (kind === "repeat_work" && !draft.follow_up_due_policy && draft.repeat_due_days != null) {
        draft.follow_up_due_policy = effectiveFollowUpDuePolicy(null, draft.repeat_due_days);
    }

    return draft;
}

export function outcomeAutomationSummaryForOutcome(
    outcomeKey: string,
    outcomeLabel: string,
    rules: StageOutcomeRuleV1[],
    options?: {
        workTemplateLabelByKey?: Record<string, string>;
        transitionOptions?: StageOutcomeTransitionOption[];
        transitionLabelByRef?: Record<string, string>;
        completesWork?: boolean;
    },
): string {
    const transitionLabelByRef =
        options?.transitionLabelByRef
        ?? Object.fromEntries(
            (options?.transitionOptions ?? []).map((opt) => [opt.transition_ref, opt.label]),
        );
    const lines = outcomeAutomationSummaries(outcomeKey, rules, {
        workTemplateLabelByKey: options?.workTemplateLabelByKey,
        transitionLabelByRef,
    });
    if (!lines.length) return "No outcome behavior configured";
    const prefix = `${outcomeLabel} →`;
    const suffix =
        options?.completesWork === true ? " · Complete current work"
        : options?.completesWork === false ? ""
        : "";
    return `${prefix} ${lines.join(" · ")}${suffix}`;
}

export function buildOutcomeRuleFromAutomation(
    outcomeKey: string,
    draft: OutcomeAutomationDraft,
    index: number,
    options?: { transitionOptions?: StageOutcomeTransitionOption[] },
): StageOutcomeRuleV1 | null {
    if (draft.kind === "none") return null;

    const rule_key = `${outcomeKey}_automation_${index + 1}`;
    const targets: StageOutcomeRuleTargetV1[] = [];
    const transitionOptions = options?.transitionOptions ?? [];

    switch (draft.kind) {
        case "stay_in_stage":
            targets.push({ kind: "no_movement" });
            if (draft.completes_work) targets.push({ kind: "mark_stage_work_complete" });
            break;
        case "move_to_stage": {
            const transitionRef = trimKey(draft.transition_ref);
            const stageKey =
                stageKeyFromTransitionRef(transitionRef, transitionOptions)
                ?? trimKey(draft.stage_key);
            if (!stageKey && !transitionRef) return null;
            const statusKey = trimKey(draft.status_key) ?? defaultStatusKeyForStage(stageKey ?? "");
            targets.push({ kind: "update_family_case_status", status_key: statusKey });
            targets.push({
                kind: "move_to_stage",
                stage_key: stageKey,
                ...(transitionRef ? { transition_ref: transitionRef } : {}),
            });
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
            const duePolicy = effectiveFollowUpDuePolicy(
                draft.follow_up_due_policy,
                draft.repeat_due_days,
            );
            const legacyDays =
                duePolicy.anchor === "outcome_recorded_at"
                && duePolicy.direction !== "before"
                && (duePolicy.offset_unit ?? "days") === "days"
                    ? duePolicy.offset_value ?? 0
                    : undefined;
            targets.push({
                kind: "create_next_work",
                template_key: templateKey,
                ...(legacyDays != null ? { due_days: legacyDays } : {}),
                follow_up_due_policy: duePolicy,
            });
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
    options?: { transitionOptions?: StageOutcomeTransitionOption[] },
): StageOutcomeRuleV1[] {
    const without = rules.filter((r) => r.when_outcome_key !== outcomeKey);
    const built = buildOutcomeRuleFromAutomation(outcomeKey, draft, without.length, options);
    if (!built) return without;
    return [...without, built];
}

export function upsertAttemptConditionalOutcomeRules(
    rules: StageOutcomeRuleV1[],
    outcomeKey: string,
    belowMax: OutcomeAutomationDraft,
    atOrAboveMax: OutcomeAutomationDraft,
    maxAttempts: number,
    options?: { transitionOptions?: StageOutcomeTransitionOption[] },
): StageOutcomeRuleV1[] {
    const without = rules.filter((r) => r.when_outcome_key !== outcomeKey);
    const next = [...without];

    const repeatRule = buildOutcomeRuleFromAutomation(
        outcomeKey,
        { ...belowMax, when_attempt_count_lt: maxAttempts },
        next.length,
        options,
    );
    if (repeatRule) next.push(repeatRule);

    const terminalRule = buildOutcomeRuleFromAutomation(
        outcomeKey,
        { ...atOrAboveMax, when_attempt_count_gte: maxAttempts },
        next.length,
        options,
    );
    if (terminalRule) next.push(terminalRule);

    return next;
}

/** @deprecated Use resolveStageOutcomeTransitionOptions with processStages instead. */
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
    { value: "none", label: "No outcome behavior" },
    { value: "stay_in_stage", label: "Remain in current stage" },
    { value: "move_to_stage", label: "Move through transition" },
    { value: "close_record", label: "Close record" },
    { value: "repeat_work", label: "Create follow-up work" },
    { value: "mark_needs_attention", label: "Create attention" },
];

export function normalizeOutcomeRulesOnPersist(
    rules: StageOutcomeRuleV1[],
    outcomes: StageOperatingPlanV1["outcomes"],
): StageOutcomeRuleV1[] {
    const outcomeKeys = new Set(outcomes.map((o) => o.outcome_key));
    return rules.filter(
        (r) =>
            Boolean((r.when_enter_status_key ?? "").trim())
            || Boolean(r.when_domain_signal?.domain && r.when_domain_signal?.signal)
            || outcomeKeys.has((r.when_outcome_key ?? "").trim()),
    );
}

export function defaultFollowUpDuePolicy(anchor: StageFollowUpDueAnchor = "outcome_recorded_at"): StageFollowUpWorkDuePolicyV1 {
    return {
        anchor,
        offset_value: anchor === "outcome_recorded_at" ? 0 : 1,
        offset_unit: "days",
        direction: anchor === "scheduled_event_start" ? "before" : "after",
        missing_anchor_behavior: "use_outcome_recorded_at",
    };
}

export function summarizeRepeatWorkDraft(
    draft: OutcomeAutomationDraft,
    workTemplateLabelByKey: Record<string, string>,
): string | null {
    if (draft.kind !== "repeat_work") return null;
    const templateKey = draft.repeat_template_key?.trim();
    if (!templateKey) return null;
    const label = workTemplateLabelByKey[templateKey] ?? templateKey.replace(/_/g, " ");
    const policy = effectiveFollowUpDuePolicy(draft.follow_up_due_policy, draft.repeat_due_days);
    return formatFollowUpDuePolicySummary(policy, label);
}

export { resolveStageOutcomeTransitionOptions };
