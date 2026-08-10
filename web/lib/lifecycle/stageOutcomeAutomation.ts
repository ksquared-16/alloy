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
import {
    isClosedStatusKeyForEntity,
    type OutcomeStatusConfiguredRow,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";

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

export type OutcomeFollowUpWorkDraft = {
    template_key: string;
    due_policy: StageFollowUpWorkDuePolicyV1;
};

export type OutcomeAttentionDraft = {
    reason: string;
    due_policy: StageFollowUpWorkDuePolicyV1;
};

export type OutcomeCaseCloseDraft = {
    /** Canonical case status this outcome writes — `closed` for a terminal outcome. */
    status_key: string;
    /** Why the case closed. Canonical vocabulary: lost | withdrawn | not_a_fit | aged_out | other. */
    close_reason_key?: string;
};

/**
 * The editable shape of one outcome's behaviour.
 *
 * `preserved_targets` and `preserved_rules` are not decoration — they are why editing an outcome no
 * longer destroys it. This draft models a subset of the ten `StageOutcomeRuleTargetKind`s, and
 * `upsertComposableOutcomeBehavior` REBUILDS the outcome's rules from it. Anything the draft could
 * not carry was therefore deleted the moment an operator touched an unrelated control: Closed Lost
 * lost `update_family_case_status: closed`, and Unable To Reach lost `reopen_work` together with
 * both of its `when_attempt_count_*` branches. The generated summary kept reading correctly the
 * whole time — it reads the rules directly — so the loss stayed invisible until after save.
 *
 * The rule this encodes: what the editor cannot express, it carries through untouched.
 */
export type ComposableOutcomeBehaviorDraft = {
    movement: "stay_in_stage" | "move_through_transition";
    transition_ref?: string;
    follow_up_work: OutcomeFollowUpWorkDraft[];
    attention_items: OutcomeAttentionDraft[];
    /** `update_family_case_status` — durable case state, owned by the outcome. */
    case_status?: OutcomeCaseCloseDraft;
    /** `mark_stage_work_complete` — whether recording this outcome finishes the current work. */
    completes_stage_work: boolean;
    /** Target kinds this draft does not model, carried verbatim so an edit cannot drop them. */
    preserved_targets: StageOutcomeRuleTargetV1[];
    /** Conditional rules for this outcome (attempt count, domain signal, entry status) — untouched. */
    preserved_rules: StageOutcomeRuleV1[];
    /** Identity of the unconditional rule, so a round-trip keeps its `rule_key`. */
    behavior_rule_key?: string;
    /** Whether an unconditional behaviour rule existed at all, so read→write stays faithful. */
    had_behavior_rule: boolean;
};

/** Kinds the draft models explicitly. Everything else rides in `preserved_targets`. */
const MODELLED_TARGET_KINDS: ReadonlySet<string> = new Set([
    "move_to_stage",
    "no_movement",
    "create_next_work",
    "create_needs_attention",
    "update_family_case_status",
    "mark_stage_work_complete",
]);

/** A rule the outcome editor owns: triggered by the outcome alone, with no extra condition. */
function isUnconditionalBehaviorRule(rule: StageOutcomeRuleV1): boolean {
    return (
        rule.when_attempt_count_lt == null &&
        rule.when_attempt_count_gte == null &&
        !rule.when_domain_signal &&
        !rule.when_enter_status_key
    );
}

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
    return rules.filter(
        (r): r is StageOutcomeRuleV1 =>
            Boolean(r) && (r.when_outcome_key ?? "").trim() === outcomeKey.trim(),
    );
}

function entityTypeForStatusTarget(kind: StageOutcomeRuleTargetV1["kind"]): string | null {
    if (kind === "update_family_case_status") return "opportunities";
    if (kind === "update_child_enrollment_status") return "opportunity_customer_members";
    return null;
}

function statusKeyFromTarget(target: StageOutcomeRuleTargetV1): string | null {
    return trimKey(target.status_key) ?? trimKey(target.disposition_key);
}

/**
 * A status-update target is close_record only when the target status resolves as
 * terminal/closed for the correct status domain (via the canonical closed-status
 * resolver). Setting status to open (or any non-closed key) is not a close.
 */
function statusUpdateIsCloseRecord(
    targets: StageOutcomeRuleTargetV1[],
    options?: {
        configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
        entityType?: string;
    },
): boolean {
    for (const target of targets) {
        const domain = entityTypeForStatusTarget(target.kind);
        if (!domain) continue;
        const statusKey = statusKeyFromTarget(target);
        if (!statusKey) continue;
        // Prefer the target's own domain; fall back to plan entityType when present.
        const entityType = domain;
        if (
            isClosedStatusKeyForEntity({
                statusKey,
                entityType,
                configuredStatuses: options?.configuredStatuses,
            })
        ) {
            return true;
        }
    }
    return false;
}

function detectAutomationKind(
    targets: StageOutcomeRuleTargetV1[],
    options?: {
        configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
        entityType?: string;
    },
): OutcomeAutomationKind {
    if (!targets.length) return "none";

    const kinds = new Set(targets.map((t) => t.kind));
    if (kinds.has("create_needs_attention") && !kinds.has("reopen_work") && !kinds.has("create_next_work")) {
        return "mark_needs_attention";
    }
    if (kinds.has("reopen_work") || kinds.has("create_next_work")) return "repeat_work";
    // Transition-owned moves first — they may also carry companion status updates.
    if (kinds.has("move_to_stage")) return "move_to_stage";
    // Status-only updates: close_record only when the target status is terminal/closed
    // for the correct domain. Non-closed status sets (e.g. open) stay in stage.
    if (kinds.has("update_family_case_status") || kinds.has("update_child_enrollment_status")) {
        return statusUpdateIsCloseRecord(targets, options) ? "close_record" : "stay_in_stage";
    }
    if (kinds.has("no_movement")) return "stay_in_stage";
    return "none";
}

/** Exported for regression tests — classification must stay aligned with validation. */
export function classifyOutcomeAutomationKind(
    targets: StageOutcomeRuleTargetV1[],
    options?: {
        configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
        entityType?: string;
    },
): OutcomeAutomationKind {
    return detectAutomationKind(targets, options);
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
        configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
        entityType?: string;
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

    const kind = detectAutomationKind(rule.targets, {
        configuredStatuses: options?.configuredStatuses,
        entityType: options?.entityType,
    });
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
        if (target.kind === "update_family_case_status") {
            const statusKey = statusKeyFromTarget(target);
            if (statusKey) draft.status_key = statusKey;
        }
        if (target.kind === "update_child_enrollment_status") {
            const statusKey = statusKeyFromTarget(target);
            if (statusKey) draft.status_key = statusKey;
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
    void options;

    switch (draft.kind) {
        case "stay_in_stage":
            targets.push({ kind: "no_movement" });
            if (draft.completes_work) targets.push({ kind: "mark_stage_work_complete" });
            break;
        case "move_to_stage": {
            const transitionRef = trimKey(draft.transition_ref);
            if (!transitionRef) return null;
            targets.push({ kind: "move_to_stage", transition_ref: transitionRef });
            break;
        }
        case "close_record": {
            // Never invent a closed status — require a configured status_key.
            const statusKey = trimKey(draft.status_key);
            if (!statusKey) return null;
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

export function readComposableOutcomeBehaviorDraft(
    outcomeKey: string,
    rules: StageOutcomeRuleV1[],
): ComposableOutcomeBehaviorDraft {
    const forOutcome = rulesForOutcome(rules, outcomeKey);

    // Conditional rules belong to whoever authored the condition. The outcome editor has no way to
    // show "…but only below 3 attempts", so it must not rewrite them — it carries them verbatim.
    const behaviorRules = forOutcome.filter(isUnconditionalBehaviorRule);
    const preserved_rules = forOutcome.filter((rule) => !isUnconditionalBehaviorRule(rule));

    const targets = behaviorRules.flatMap((rule) => rule.targets);
    const move = targets.find((target) => target.kind === "move_to_stage");
    const caseStatus = targets.find((target) => target.kind === "update_family_case_status");

    return {
        movement: move ? "move_through_transition" : "stay_in_stage",
        ...(move?.transition_ref ? { transition_ref: move.transition_ref } : {}),
        follow_up_work: targets
            .filter((target) => target.kind === "create_next_work")
            .map((target) => ({
                template_key: target.template_key ?? "",
                due_policy: effectiveFollowUpDuePolicy(target.follow_up_due_policy, target.due_days),
            })),
        attention_items: targets
            .filter((target) => target.kind === "create_needs_attention")
            .map((target) => ({
                reason: target.attention_reason ?? "Needs attention",
                due_policy: effectiveFollowUpDuePolicy(target.follow_up_due_policy, target.due_days),
            })),
        ...(caseStatus?.status_key
            ? {
                  case_status: {
                      status_key: caseStatus.status_key,
                      ...(caseStatus.close_reason_key
                          ? { close_reason_key: caseStatus.close_reason_key }
                          : {}),
                  },
              }
            : {}),
        completes_stage_work: targets.some((target) => target.kind === "mark_stage_work_complete"),
        preserved_targets: targets.filter((target) => !MODELLED_TARGET_KINDS.has(target.kind)),
        preserved_rules,
        ...(behaviorRules[0]?.rule_key ? { behavior_rule_key: behaviorRules[0].rule_key } : {}),
        had_behavior_rule: behaviorRules.length > 0,
    };
}

export function upsertComposableOutcomeBehavior(
    rules: StageOutcomeRuleV1[],
    outcomeKey: string,
    draft: ComposableOutcomeBehaviorDraft,
): StageOutcomeRuleV1[] {
    const without = rules.filter((rule) => rule.when_outcome_key !== outcomeKey);
    const targets: StageOutcomeRuleTargetV1[] = [];
    if (draft.movement === "move_through_transition") {
        const transitionRef = trimKey(draft.transition_ref);
        if (transitionRef) targets.push({ kind: "move_to_stage", transition_ref: transitionRef });
    } else {
        targets.push({ kind: "no_movement" });
    }
    // Durable case state before the work bookkeeping, matching how the seeds read.
    if (draft.case_status?.status_key?.trim()) {
        const closeReason = trimKey(draft.case_status.close_reason_key);
        targets.push({
            kind: "update_family_case_status",
            status_key: draft.case_status.status_key.trim(),
            ...(closeReason ? { close_reason_key: closeReason } : {}),
        });
    }
    if (draft.completes_stage_work) targets.push({ kind: "mark_stage_work_complete" });
    for (const followUp of draft.follow_up_work) {
        const templateKey = trimKey(followUp.template_key);
        if (!templateKey) continue;
        targets.push({
            kind: "create_next_work",
            template_key: templateKey,
            follow_up_due_policy: followUp.due_policy,
        });
    }
    for (const attention of draft.attention_items) {
        targets.push({
            kind: "create_needs_attention",
            attention_reason: trimKey(attention.reason) ?? "Needs attention",
            wait_bucket: "waiting_on_staff",
            follow_up_due_policy: attention.due_policy,
        });
    }
    // Everything the editor cannot express, exactly as it arrived.
    targets.push(...(draft.preserved_targets ?? []));

    // Conditional rules are restored untouched — including their conditions and rule keys.
    const restored = draft.preserved_rules ?? [];

    // Only emit a behaviour rule if one existed or the operator has something to say. Inventing one
    // for an outcome whose behaviour lives entirely in conditional rules would add configuration
    // the operator never authored.
    const hasContent =
        draft.movement === "move_through_transition" ||
        Boolean(draft.case_status?.status_key?.trim()) ||
        draft.completes_stage_work ||
        draft.follow_up_work.some((row) => trimKey(row.template_key)) ||
        draft.attention_items.length > 0 ||
        (draft.preserved_targets ?? []).length > 0;

    if (!draft.had_behavior_rule && !hasContent) return [...without, ...restored];

    return [
        ...without,
        ...restored,
        {
            rule_key: draft.behavior_rule_key?.trim() || `${outcomeKey}_behavior`,
            when_outcome_key: outcomeKey,
            targets,
        },
    ];
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
