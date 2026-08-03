/**
 * stage_operating_plan_v1 — lifecycle builder stage work + outcome rules (metadata only).
 *
 * Stored on builder stage records alongside queue_membership_v1.
 * No schema migration — departments.metadata JSON only.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { normalizeCompletionPolicy } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import {
    parseStageFollowUpWorkDuePolicyV1,
    type StageFollowUpDueOffsetUnit,
    type StageFollowUpWorkDuePolicyV1,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";

export type { StageFollowUpWorkDuePolicyV1 } from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";

const ATTENTION_DURATION_UNITS = new Set<StageFollowUpDueOffsetUnit>([
    "minutes",
    "hours",
    "days",
    "weeks",
    "months",
]);

export const STAGE_OPERATING_PLAN_METADATA_KEY = "stage_operating_plan_v1" as const;

export type StageJourneySegment = "family" | "child";

export type StageWorkDuePolicy =
    | { kind: "same_day" }
    | { kind: "offset_days"; days: number };

export type StageWorkOwnerStrategy = "record_owner" | "creator" | "unassigned";

/**
 * Command-result sufficiency (R2). Configuration may declare that a specific
 * objective result published by a platform capability satisfies a Current Work
 * requirement — completing it with the mapped authored outcome, with no operator
 * declaration required. `result` is always an objective capability result
 * (e.g. "sent"), never an operator judgment. `satisfies_outcome_key` must name an
 * authored outcome in the same stage. Absent a matching entry, a successful
 * command never auto-completes the work.
 */
export type StageWorkSufficientCommandResultV1 = {
    /** Platform capability that published the result (e.g. "communications_send"). */
    capability: string;
    /** Objective result key the capability published (e.g. "sent"). Never a declaration. */
    result: string;
    /** Authored stage outcome this objective result satisfies. */
    satisfies_outcome_key: string;
};

export type StageWorkCompletionPolicyV1 = {
    min_attempts?: number;
    max_attempts?: number;
    window_days?: number;
    repeat_until_outcome?: boolean;
    repeat_due_days?: number;
    /**
     * Objective capability results configuration declares sufficient to satisfy
     * this requirement (R2). When absent on a recognized canonical work template
     * (e.g. contact_family), the platform default may apply at runtime; unknown
     * or custom work never infers sufficiency. Explicit entries always win.
     * Operators never see raw runtime result keys in UI.
     */
    sufficient_command_results?: StageWorkSufficientCommandResultV1[];
};

export type StageWorkTemplateActionRefV1 = {
    action_ref: string;
    override_label?: string;
};

export type StageWorkTemplateTransitionRefV1 = {
    transition_ref: string;
    override_label?: string;
};

export type StageWorkTemplateOutcomeRefV1 = {
    outcome_ref: string;
};

export type StageWorkTemplateAlternatePathRefV1 =
    | StageWorkTemplateTransitionRefV1
    | StageWorkTemplateActionRefV1;

export function isWorkTemplateTransitionRef(
    ref: StageWorkTemplateAlternatePathRefV1,
): ref is StageWorkTemplateTransitionRefV1 {
    return typeof (ref as StageWorkTemplateTransitionRefV1).transition_ref === "string";
}

export type StageWorkTemplateExecutionModeV1 = "direct_action" | "outcome_led";

export type StageWorkTemplateV1 = {
    template_key: string;
    label: string;
    description?: string;
    required: boolean;
    due_policy: StageWorkDuePolicy;
    owner_strategy: StageWorkOwnerStrategy;
    /** When true, drives primary Work Intent runtime for this stage. Only one should be set. */
    primary?: boolean;
    /** Optional link to platform work definition catalog key. */
    work_definition_key?: string | null;
    completion_policy?: StageWorkCompletionPolicyV1;
    /**
     * Explicit work execution mode. Prefer setting with primary_action:
     * - direct_action: Primary Action is the leading CTA
     * - outcome_led: no Primary Action; Record Outcome leads
     * When omitted, runtime derives from primary_action presence.
     */
    execution_mode?: StageWorkTemplateExecutionModeV1;
    /** Operator primary execution affordance for this work template. Absence is valid for outcome-led work. */
    primary_action?: StageWorkTemplateActionRefV1;
    /** Ordered helpful actions shown on Current Work summary. Empty array = explicitly none. */
    helpful_actions?: StageWorkTemplateActionRefV1[];
    /** Ordered alternate progression paths (transitions or actions). Empty array = explicitly none. */
    alternate_paths?: StageWorkTemplateAlternatePathRefV1[];
    /** Ordered outcome refs — filters canonical stage outcomes for this template. Empty = explicitly none. */
    outcome_refs?: StageWorkTemplateOutcomeRefV1[];
};

export type StageCompletionOutcomeV1 = {
    outcome_key: string;
    label: string;
    /** When set, outcome is scoped to a work item in the operating plan editor. */
    work_template_key?: string | null;
    /**
     * When true, recording this outcome completes the active work item.
     * Also counts toward successful-progress SLA rules (legacy `successful` alias).
     */
    successful?: boolean;
    /** Explicit completion semantic — persisted alias of `successful` when set. */
    completes_work?: boolean;
};

/**
 * A stage-owned directed process edge. `closes_record` is derived by the
 * authoring surface from the selected canonical status; it is never a
 * separately-authored behavior.
 */
export type StageOutgoingTransitionV1 = {
    transition_ref: string;
    source_stage_key: string;
    target_stage_key: string;
    label: string;
    available: boolean;
    status_key?: string;
    closes_record?: true;
};

export type StageOutcomeRuleTargetKind =
    | "update_family_case_status"
    | "update_child_enrollment_status"
    | "update_candidate_status"
    | "create_needs_attention"
    | "create_next_work"
    | "reopen_work"
    | "mark_stage_work_complete"
    | "move_to_stage"
    | "no_movement";

export type StageOutcomeRuleTargetV1 = {
    kind: StageOutcomeRuleTargetKind;
    status_key?: string | null;
    disposition_key?: string | null;
    /** Reason written alongside a terminal status (update_family_case_status / update_child_enrollment_status). */
    close_reason_key?: string | null;
    candidate_status?: "active" | "paused" | "withdrawn" | "placed" | null;
    attention_reason?: string | null;
    wait_bucket?: string | null;
    template_key?: string | null;
    stage_key?: string | null;
    /** Canonical transition identity for move_to_stage — preferred over stage_key alone. */
    transition_ref?: string | null;
    /** Due offset for create_next_work / reopen_work targets (legacy — prefer follow_up_due_policy). */
    due_days?: number | null;
    /** Anchored due policy for create_next_work follow-up scheduling. */
    follow_up_due_policy?: StageFollowUpWorkDuePolicyV1;
};

export type StageDomainSignalTriggerV1 = {
    domain: string;
    signal: string;
};

export type StageOutcomeRuleV1 = {
    rule_key: string;
    /** Manual work-outcome completion in the operating plan editor. */
    when_outcome_key?: string | null;
    /** Apply when opportunity status_key enters this value. */
    when_enter_status_key?: string | null;
    /** Apply when a domain lifecycle signal is emitted (no status change). */
    when_domain_signal?: StageDomainSignalTriggerV1 | null;
    targets: StageOutcomeRuleTargetV1[];
    /** Apply only when attempt count is strictly less than this value. */
    when_attempt_count_lt?: number;
    /** Apply only when attempt count is greater than or equal to this value. */
    when_attempt_count_gte?: number;
};

export type StageAttentionRuleKind =
    | "work_overdue"
    | "stage_age_exceeded"
    | "missing_requirements"
    /** @deprecated Prefer missing_requirements */
    | "missing_required_fields"
    | "no_contact_attempt"
    | "waiting_on_family"
    | "waiting_on_provider"
    /** @deprecated Prefer no_contact_attempt */
    | "tasks_without_success"
    /** @deprecated Prefer stage_age_exceeded */
    | "days_without_success"
    /** @deprecated Prefer work_overdue */
    | "required_work_overdue";

export type StageAttentionSeverity = "low" | "medium" | "high";

/** Elapsed-time threshold for attention rules — shared duration units with follow-up work. */
export type StageAttentionThresholdDurationV1 = {
    offset_value: number;
    offset_unit: StageFollowUpDueOffsetUnit;
};

export type StageAttentionRuleV1 = {
    rule_key: string;
    kind: StageAttentionRuleKind;
    /** Operator label shown in Business Process editor. */
    label?: string;
    severity?: StageAttentionSeverity;
    /**
     * Legacy day threshold. Kept for compatibility; prefer `threshold_duration`.
     * For `no_contact_attempt`, this remains the minimum attempt count.
     */
    threshold?: number;
    /** Canonical elapsed-time threshold (value + unit). */
    threshold_duration?: StageAttentionThresholdDurationV1;
    /** Optional work item scope for work_overdue rules. */
    template_key?: string | null;
    targets: StageOutcomeRuleTargetV1[];
};

export type StageOperatingPlanV1 = {
    version: 1;
    lifecycle_key: string;
    stage_key: string;
    purpose?: string;
    journey_segment: StageJourneySegment;
    /** Absent on legacy plans. When present, this is the authoritative edge set. */
    outgoing_transitions?: StageOutgoingTransitionV1[];
    work_templates: StageWorkTemplateV1[];
    outcomes: StageCompletionOutcomeV1[];
    outcome_rules: StageOutcomeRuleV1[];
    attention_rules: StageAttentionRuleV1[];
};

const JOURNEY_SEGMENTS = new Set<StageJourneySegment>(["family", "child"]);
const OWNER_STRATEGIES = new Set<StageWorkOwnerStrategy>(["record_owner", "creator", "unassigned"]);
const EXECUTION_MODES = new Set<StageWorkTemplateExecutionModeV1>(["direct_action", "outcome_led"]);
const TARGET_KINDS = new Set<StageOutcomeRuleTargetKind>([
    "update_family_case_status",
    "update_child_enrollment_status",
    "update_candidate_status",
    "create_needs_attention",
    "create_next_work",
    "reopen_work",
    "mark_stage_work_complete",
    "move_to_stage",
    "no_movement",
]);
const ATTENTION_KINDS = new Set<StageAttentionRuleKind>([
    "work_overdue",
    "stage_age_exceeded",
    "missing_requirements",
    "missing_required_fields",
    "no_contact_attempt",
    "waiting_on_family",
    "waiting_on_provider",
    "tasks_without_success",
    "days_without_success",
    "required_work_overdue",
]);
const ATTENTION_SEVERITIES = new Set<StageAttentionSeverity>(["low", "medium", "high"]);
const CANDIDATE_STATUSES = new Set<string>(["active", "paused", "withdrawn", "placed"]);

function trimNonEmpty(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function parseActionRef(raw: unknown): StageWorkTemplateActionRefV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const action_ref = trimNonEmpty(o.action_ref);
    if (!action_ref) return null;
    const override_label = trimNonEmpty(o.override_label);
    return override_label ? { action_ref, override_label } : { action_ref };
}

function parseTransitionRef(raw: unknown): StageWorkTemplateTransitionRefV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const transition_ref = trimNonEmpty(o.transition_ref);
    if (!transition_ref) return null;
    const override_label = trimNonEmpty(o.override_label);
    return override_label ? { transition_ref, override_label } : { transition_ref };
}

function parseAlternatePathRef(raw: unknown): StageWorkTemplateAlternatePathRefV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (trimNonEmpty(o.transition_ref)) return parseTransitionRef(raw);
    if (trimNonEmpty(o.action_ref)) return parseActionRef(raw);
    return null;
}

function parseOutcomeRef(raw: unknown): StageWorkTemplateOutcomeRefV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const outcome_ref = trimNonEmpty(o.outcome_ref);
    if (!outcome_ref) return null;
    return { outcome_ref };
}

function parseDuePolicy(raw: unknown): StageWorkDuePolicy | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const kind = trimNonEmpty(o.kind);
    if (kind === "same_day") return { kind: "same_day" };
    if (kind === "offset_days") {
        const days = typeof o.days === "number" && Number.isFinite(o.days) ? Math.max(0, Math.floor(o.days)) : null;
        if (days == null) return null;
        return { kind: "offset_days", days };
    }
    return null;
}

function parseWorkTemplate(raw: unknown): StageWorkTemplateV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const template_key = trimNonEmpty(o.template_key);
    const label = trimNonEmpty(o.label);
    const due_policy = parseDuePolicy(o.due_policy);
    const ownerRaw = trimNonEmpty(o.owner_strategy);
    if (!template_key || !label || !due_policy || !ownerRaw || !OWNER_STRATEGIES.has(ownerRaw as StageWorkOwnerStrategy)) {
        return null;
    }
    const tpl: StageWorkTemplateV1 = {
        template_key,
        label,
        required: o.required === true,
        due_policy,
        owner_strategy: ownerRaw as StageWorkOwnerStrategy,
    };
    const desc = trimNonEmpty(o.description);
    if (desc) tpl.description = desc;
    const wdk = trimNonEmpty(o.work_definition_key);
    if (wdk) tpl.work_definition_key = wdk;
    if (o.primary === true) tpl.primary = true;
    const completion_policy = normalizeCompletionPolicy(
        o.completion_policy as StageWorkCompletionPolicyV1 | undefined,
    );
    if (completion_policy) tpl.completion_policy = completion_policy;

    const executionModeRaw = trimNonEmpty(o.execution_mode);
    if (executionModeRaw && EXECUTION_MODES.has(executionModeRaw as StageWorkTemplateExecutionModeV1)) {
        tpl.execution_mode = executionModeRaw as StageWorkTemplateExecutionModeV1;
    }

    const primary_action = parseActionRef(o.primary_action);
    if (primary_action) tpl.primary_action = primary_action;

    if (Array.isArray(o.helpful_actions)) {
        const helpful_actions: StageWorkTemplateActionRefV1[] = [];
        for (const item of o.helpful_actions) {
            const parsed = parseActionRef(item);
            if (parsed) helpful_actions.push(parsed);
        }
        tpl.helpful_actions = helpful_actions;
    }

    if (Array.isArray(o.alternate_paths)) {
        const alternate_paths: StageWorkTemplateAlternatePathRefV1[] = [];
        for (const item of o.alternate_paths) {
            const parsed = parseAlternatePathRef(item);
            if (parsed) alternate_paths.push(parsed);
        }
        tpl.alternate_paths = alternate_paths;
    }

    if (Array.isArray(o.outcome_refs)) {
        const outcome_refs: StageWorkTemplateOutcomeRefV1[] = [];
        for (const item of o.outcome_refs) {
            const parsed = parseOutcomeRef(item);
            if (parsed) outcome_refs.push(parsed);
        }
        tpl.outcome_refs = outcome_refs;
    }

    return tpl;
}

function parseOutcome(raw: unknown): StageCompletionOutcomeV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const outcome_key = trimNonEmpty(o.outcome_key);
    const label = trimNonEmpty(o.label);
    if (!outcome_key || !label) return null;
    const completesWork = o.completes_work === true || o.successful === true;
    return {
        outcome_key,
        label,
        ...(trimNonEmpty(o.work_template_key) ? { work_template_key: trimNonEmpty(o.work_template_key) } : {}),
        ...(completesWork ? { successful: true, completes_work: true } : {}),
    };
}

function parseOutgoingTransition(raw: unknown): StageOutgoingTransitionV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const transition_ref = trimNonEmpty(o.transition_ref);
    const source_stage_key = trimNonEmpty(o.source_stage_key);
    const target_stage_key = trimNonEmpty(o.target_stage_key);
    const label = trimNonEmpty(o.label);
    if (!transition_ref || !source_stage_key || !target_stage_key || !label) return null;
    const status_key = trimNonEmpty(o.status_key);
    return {
        transition_ref,
        source_stage_key,
        target_stage_key,
        label,
        available: o.available !== false,
        ...(status_key ? { status_key } : {}),
        ...(o.closes_record === true ? { closes_record: true as const } : {}),
    };
}

function parseTarget(raw: unknown): StageOutcomeRuleTargetV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const kind = trimNonEmpty(o.kind);
    if (!kind || !TARGET_KINDS.has(kind as StageOutcomeRuleTargetKind)) return null;
    const target: StageOutcomeRuleTargetV1 = { kind: kind as StageOutcomeRuleTargetKind };
    const status_key = trimNonEmpty(o.status_key);
    if (status_key) target.status_key = status_key;
    const disposition_key = trimNonEmpty(o.disposition_key);
    if (disposition_key) target.disposition_key = disposition_key;
    const close_reason_key = trimNonEmpty(o.close_reason_key);
    if (close_reason_key) target.close_reason_key = close_reason_key;
    const candidate_status = trimNonEmpty(o.candidate_status);
    if (candidate_status && CANDIDATE_STATUSES.has(candidate_status)) {
        target.candidate_status = candidate_status as StageOutcomeRuleTargetV1["candidate_status"];
    }
    const attention_reason = trimNonEmpty(o.attention_reason);
    if (attention_reason) target.attention_reason = attention_reason;
    const wait_bucket = trimNonEmpty(o.wait_bucket);
    if (wait_bucket) target.wait_bucket = wait_bucket;
    const template_key = trimNonEmpty(o.template_key);
    if (template_key) target.template_key = template_key;
    const stage_key = trimNonEmpty(o.stage_key);
    if (stage_key) target.stage_key = stage_key;
    const transition_ref = trimNonEmpty(o.transition_ref);
    if (transition_ref) target.transition_ref = transition_ref;
    if (typeof o.due_days === "number" && Number.isFinite(o.due_days)) {
        target.due_days = Math.max(0, Math.floor(o.due_days));
    }
    const follow_up_due_policy = parseStageFollowUpWorkDuePolicyV1(o.follow_up_due_policy);
    if (follow_up_due_policy) target.follow_up_due_policy = follow_up_due_policy;
    return target;
}

function parseDomainSignalTrigger(raw: unknown): StageDomainSignalTriggerV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const domain = trimNonEmpty(o.domain);
    const signal = trimNonEmpty(o.signal);
    if (!domain || !signal) return null;
    return { domain, signal };
}

function parseOutcomeRule(raw: unknown): StageOutcomeRuleV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const rule_key = trimNonEmpty(o.rule_key);
    const when_outcome_key = trimNonEmpty(o.when_outcome_key);
    const when_enter_status_key = trimNonEmpty(o.when_enter_status_key);
    const when_domain_signal = parseDomainSignalTrigger(o.when_domain_signal);
    if (!rule_key || !Array.isArray(o.targets)) return null;
    if (!when_outcome_key && !when_enter_status_key && !when_domain_signal) return null;
    const targets: StageOutcomeRuleTargetV1[] = [];
    for (const t of o.targets) {
        const parsed = parseTarget(t);
        if (parsed) targets.push(parsed);
    }
    if (!targets.length) return null;
    const rule: StageOutcomeRuleV1 = {
        rule_key,
        ...(when_outcome_key ? { when_outcome_key } : {}),
        ...(when_enter_status_key ? { when_enter_status_key } : {}),
        ...(when_domain_signal ? { when_domain_signal } : {}),
        targets,
    };
    if (typeof o.when_attempt_count_lt === "number" && Number.isFinite(o.when_attempt_count_lt)) {
        rule.when_attempt_count_lt = Math.max(0, Math.floor(o.when_attempt_count_lt));
    }
    if (typeof o.when_attempt_count_gte === "number" && Number.isFinite(o.when_attempt_count_gte)) {
        rule.when_attempt_count_gte = Math.max(0, Math.floor(o.when_attempt_count_gte));
    }
    return rule;
}

function parseAttentionRule(raw: unknown): StageAttentionRuleV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const rule_key = trimNonEmpty(o.rule_key);
    const kind = trimNonEmpty(o.kind);
    if (!rule_key || !kind || !ATTENTION_KINDS.has(kind as StageAttentionRuleKind)) return null;
    const targets: StageOutcomeRuleTargetV1[] = [];
    if (Array.isArray(o.targets)) {
        for (const t of o.targets) {
            const parsed = parseTarget(t);
            if (parsed) targets.push(parsed);
        }
    }
    const rule: StageAttentionRuleV1 = {
        rule_key,
        kind: kind as StageAttentionRuleKind,
        targets,
    };
    const label = trimNonEmpty(o.label);
    if (label) rule.label = label;
    const severity = trimNonEmpty(o.severity);
    if (severity && ATTENTION_SEVERITIES.has(severity as StageAttentionSeverity)) {
        rule.severity = severity as StageAttentionSeverity;
    }
    if (typeof o.threshold === "number" && Number.isFinite(o.threshold)) {
        rule.threshold = Math.max(0, Math.floor(o.threshold));
    }
    if (o.threshold_duration != null && typeof o.threshold_duration === "object" && !Array.isArray(o.threshold_duration)) {
        const d = o.threshold_duration as Record<string, unknown>;
        const offset_value =
            typeof d.offset_value === "number" && Number.isFinite(d.offset_value) ?
                Math.max(0, Math.floor(d.offset_value))
            :   null;
        const offset_unit = trimNonEmpty(d.offset_unit) as StageFollowUpDueOffsetUnit | null;
        if (offset_value != null && offset_unit && ATTENTION_DURATION_UNITS.has(offset_unit)) {
            rule.threshold_duration = { offset_value, offset_unit };
        }
    }
    // Normalize legacy day-only thresholds for elapsed-time rule kinds only.
    const elapsedTimeKinds = new Set<StageAttentionRuleKind>([
        "work_overdue",
        "required_work_overdue",
        "stage_age_exceeded",
        "days_without_success",
        "waiting_on_family",
        "waiting_on_provider",
    ]);
    if (
        !rule.threshold_duration
        && typeof rule.threshold === "number"
        && elapsedTimeKinds.has(rule.kind)
    ) {
        rule.threshold_duration = { offset_value: rule.threshold, offset_unit: "days" };
    }
    const template_key = trimNonEmpty(o.template_key);
    if (template_key) rule.template_key = template_key;
    return rule;
}

export function parseStageOperatingPlanV1(raw: unknown): StageOperatingPlanV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;

    const lifecycle_key = trimNonEmpty(o.lifecycle_key);
    const stage_key = trimNonEmpty(o.stage_key);
    const journeyRaw = trimNonEmpty(o.journey_segment);
    if (!lifecycle_key || !stage_key || !journeyRaw || !JOURNEY_SEGMENTS.has(journeyRaw as StageJourneySegment)) {
        return null;
    }

    const work_templates: StageWorkTemplateV1[] = [];
    if (Array.isArray(o.work_templates)) {
        for (const item of o.work_templates) {
            const parsed = parseWorkTemplate(item);
            if (parsed) work_templates.push(parsed);
        }
    }

    const outcomes: StageCompletionOutcomeV1[] = [];
    if (Array.isArray(o.outcomes)) {
        for (const item of o.outcomes) {
            const parsed = parseOutcome(item);
            if (parsed) outcomes.push(parsed);
        }
    }

    const outgoing_transitions: StageOutgoingTransitionV1[] = [];
    if (Array.isArray(o.outgoing_transitions)) {
        for (const item of o.outgoing_transitions) {
            const parsed = parseOutgoingTransition(item);
            if (parsed) outgoing_transitions.push(parsed);
        }
    }

    const outcome_rules: StageOutcomeRuleV1[] = [];
    if (Array.isArray(o.outcome_rules)) {
        for (const item of o.outcome_rules) {
            const parsed = parseOutcomeRule(item);
            if (parsed) outcome_rules.push(parsed);
        }
    }

    const attention_rules: StageAttentionRuleV1[] = [];
    if (Array.isArray(o.attention_rules)) {
        for (const item of o.attention_rules) {
            const parsed = parseAttentionRule(item);
            if (parsed) attention_rules.push(parsed);
        }
    }

    const plan: StageOperatingPlanV1 = {
        version: 1,
        lifecycle_key,
        stage_key,
        journey_segment: journeyRaw as StageJourneySegment,
        ...(Array.isArray(o.outgoing_transitions) ? { outgoing_transitions } : {}),
        work_templates,
        outcomes,
        outcome_rules,
        attention_rules,
    };

    const purpose = trimNonEmpty(o.purpose);
    if (purpose) plan.purpose = purpose;

    return plan;
}

/** Resolve explicit stage_operating_plan_v1 from stage metadata only. */
export function resolveStageOperatingPlanForStage(
    stageConfig: unknown,
    _fallbackStageKey?: string,
    _lifecycleKey: string = ENROLLMENT_PROCESS_KEY,
): StageOperatingPlanV1 | null {
    if (stageConfig != null && typeof stageConfig === "object" && !Array.isArray(stageConfig)) {
        const record = stageConfig as Record<string, unknown>;
        if (record[STAGE_OPERATING_PLAN_METADATA_KEY] !== undefined) {
            const parsed = parseStageOperatingPlanV1(record[STAGE_OPERATING_PLAN_METADATA_KEY]);
            if (parsed) return parsed;
        }
        if (record.stage_operating_plan_v1 !== undefined) {
            const parsed = parseStageOperatingPlanV1(record.stage_operating_plan_v1);
            if (parsed) return parsed;
        }
    }
    return null;
}

export function outcomeRulesForKey(
    plan: StageOperatingPlanV1,
    outcomeKey: string,
    options?: { attemptCount?: number | null },
): StageOutcomeRuleV1[] {
    const key = outcomeKey.trim();
    const attemptCount = options?.attemptCount;
    return plan.outcome_rules.filter((r) => {
        if ((r.when_outcome_key ?? "").trim() !== key) return false;
        if (attemptCount == null) return true;
        if (r.when_attempt_count_lt != null && attemptCount >= r.when_attempt_count_lt) return false;
        if (r.when_attempt_count_gte != null && attemptCount < r.when_attempt_count_gte) return false;
        return true;
    });
}

export function statusEntryRulesForStatusKey(
    plan: StageOperatingPlanV1,
    statusKey: string,
): StageOutcomeRuleV1[] {
    const key = statusKey.trim();
    if (!key) return [];
    return plan.outcome_rules.filter((r) => (r.when_enter_status_key ?? "").trim() === key);
}

export function domainSignalRulesForSignal(
    plan: StageOperatingPlanV1,
    domain: string,
    signal: string,
): StageOutcomeRuleV1[] {
    const domainKey = domain.trim();
    const signalKey = signal.trim();
    if (!domainKey || !signalKey) return [];
    return plan.outcome_rules.filter((r) => {
        const trigger = r.when_domain_signal;
        if (!trigger) return false;
        return trigger.domain.trim() === domainKey && trigger.signal.trim() === signalKey;
    });
}

export function successfulOutcomeKeys(plan: StageOperatingPlanV1): Set<string> {
    return new Set(plan.outcomes.filter((o) => o.successful).map((o) => o.outcome_key));
}
