/**
 * stage_operating_plan_v1 — lifecycle builder stage work + outcome rules (metadata only).
 *
 * Stored on builder stage records alongside queue_membership_v1.
 * No schema migration — departments.metadata JSON only.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { normalizeCompletionPolicy } from "@/lib/lifecycle/stageWorkCompletionPolicy";

export const STAGE_OPERATING_PLAN_METADATA_KEY = "stage_operating_plan_v1" as const;

export type StageJourneySegment = "family" | "child";

export type StageWorkDuePolicy =
    | { kind: "same_day" }
    | { kind: "offset_days"; days: number };

export type StageWorkOwnerStrategy = "record_owner" | "creator" | "unassigned";

export type StageWorkCompletionPolicyV1 = {
    min_attempts?: number;
    max_attempts?: number;
    window_days?: number;
    repeat_until_outcome?: boolean;
    repeat_due_days?: number;
};

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
};

export type StageCompletionOutcomeV1 = {
    outcome_key: string;
    label: string;
    /** When set, outcome is scoped to a work item in the operating plan editor. */
    work_template_key?: string | null;
    /** When true, counts toward successful-progress SLA rules. */
    successful?: boolean;
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
    /** Due offset for create_next_work / reopen_work targets. */
    due_days?: number | null;
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

export type StageAttentionRuleV1 = {
    rule_key: string;
    kind: StageAttentionRuleKind;
    /** Operator label shown in Business Process editor. */
    label?: string;
    severity?: StageAttentionSeverity;
    threshold?: number;
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
    work_templates: StageWorkTemplateV1[];
    outcomes: StageCompletionOutcomeV1[];
    outcome_rules: StageOutcomeRuleV1[];
    attention_rules: StageAttentionRuleV1[];
};

const JOURNEY_SEGMENTS = new Set<StageJourneySegment>(["family", "child"]);
const OWNER_STRATEGIES = new Set<StageWorkOwnerStrategy>(["record_owner", "creator", "unassigned"]);
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
    return tpl;
}

function parseOutcome(raw: unknown): StageCompletionOutcomeV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const outcome_key = trimNonEmpty(o.outcome_key);
    const label = trimNonEmpty(o.label);
    if (!outcome_key || !label) return null;
    return {
        outcome_key,
        label,
        ...(trimNonEmpty(o.work_template_key) ? { work_template_key: trimNonEmpty(o.work_template_key) } : {}),
        ...(o.successful === true ? { successful: true } : {}),
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
    if (typeof o.due_days === "number" && Number.isFinite(o.due_days)) {
        target.due_days = Math.max(0, Math.floor(o.due_days));
    }
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
