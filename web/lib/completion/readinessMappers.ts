/**
 * Map legacy effective requirements output → ReadinessResult v1.0.
 * Pure utilities — no DB access, no evaluator side effects.
 */

import type {
    EffectiveRequirementViolation,
    EffectiveRequirementsResult,
} from "@/lib/completion/effectiveRequirementsTypes";
import type {
    ReadinessCounts,
    ReadinessGap,
    ReadinessPrimaryState,
    ReadinessResult,
    ReadinessTrigger,
    RequirementLevel,
    ReadinessContext,
    ReadinessSubject,
    ReadinessEvalInput,
} from "@/lib/completion/readinessTypes";
import { READINESS_RESULT_CONTRACT_VERSION } from "@/lib/completion/readinessTypes";

const BLOCKING_TRIGGERS = new Set<ReadinessTrigger>([
    "action_execute",
    "form_submit",
    "status_transition",
]);

export function isReadinessBlockingTrigger(trigger: ReadinessTrigger): boolean {
    return BLOCKING_TRIGGERS.has(trigger);
}

/** Severity order for composite primary_state (Phase 1). */
export function derivePrimaryStateFromGaps(gaps: ReadinessGap[]): ReadinessPrimaryState {
    if (gaps.some((g) => g.blocking)) return "blocked";
    if (gaps.some((g) => g.failure_kind === "expired")) return "expired";
    if (gaps.length > 0) return "needs_information";
    return "ready";
}

function requirementIdFromViolation(v: EffectiveRequirementViolation): string {
    if (v.rule_id?.trim()) return v.rule_id.trim();
    const fieldKey = v.field_key?.trim();
    if (fieldKey) return fieldKey;
    return v.label.trim().toLowerCase().replace(/\s+/g, "_") || "unknown_requirement";
}

function gapLevelFromEffectiveViolation(v: EffectiveRequirementViolation): RequirementLevel {
    if (v.requirement_level) return v.requirement_level;
    if (v.severity === "recommended") return "recommended";
    if (v.severity === "warning") return "required";
    return "enforced";
}

function mapViolationToGap(
    v: EffectiveRequirementViolation,
    input: {
        level: RequirementLevel;
        trigger: ReadinessTrigger;
        forceBlocking?: boolean;
    }
): ReadinessGap {
    const blocking =
        input.forceBlocking ??
        (input.level === "enforced" && isReadinessBlockingTrigger(input.trigger));

    const resolution =
        v.resolution?.type === "action" && v.resolution.action_key
            ? { type: "action" as const, action_key: v.resolution.action_key }
            : v.resolution?.type === "field" && v.resolution.field_key
              ? { type: "field" as const }
              : v.field_key
                ? { type: "field" as const }
                : undefined;

    return {
        requirement_id: requirementIdFromViolation(v),
        scope_type: "record",
        level: input.level,
        label: v.label,
        missing_reason: v.reason,
        failure_kind: "missing",
        blocking,
        entity_type: v.entity_type,
        entity_id: v.entity_id,
        field_key: v.field_key,
        resolution,
    };
}

function mapEffectiveViolationToGap(
    v: EffectiveRequirementViolation,
    trigger: ReadinessTrigger,
    forceLevel?: RequirementLevel
): ReadinessGap {
    const level = forceLevel ?? gapLevelFromEffectiveViolation(v);
    return mapViolationToGap(v, { level, trigger });
}

export function mapEffectiveViolationToReadinessGap(
    v: EffectiveRequirementViolation,
    input: {
        trigger: ReadinessTrigger;
        asLevel?: RequirementLevel;
    }
): ReadinessGap {
    return mapEffectiveViolationToGap(v, input.trigger, input.asLevel);
}

export function mapEffectiveRequirementsToReadinessGaps(
    effective: EffectiveRequirementsResult,
    trigger: ReadinessTrigger
): ReadinessGap[] {
    const blockingGaps = effective.blocking.map((v) => mapEffectiveViolationToGap(v, trigger));
    const recommendedGaps = effective.recommended.map((v) => mapEffectiveViolationToGap(v, trigger));
    return [...blockingGaps, ...recommendedGaps];
}

export function buildReadinessCountsFromGaps(
    gaps: ReadinessGap[],
    input?: { configured?: number; satisfied?: number }
): ReadinessCounts {
    const by_level = { recommended: 0, required: 0, enforced: 0 };
    for (const gap of gaps) {
        by_level[gap.level] += 1;
    }
    const configured = input?.configured ?? gaps.length;
    const satisfied = input?.satisfied ?? Math.max(0, configured - gaps.length);
    return {
        gaps_total: gaps.length,
        by_level,
        blocking: gaps.filter((g) => g.blocking).length,
        satisfied,
        configured,
    };
}

export function buildReadinessCompletionSummary(counts: ReadinessCounts): ReadinessResult["completion_summary"] {
    if (counts.configured <= 0) return undefined;
    const ratio = counts.satisfied / counts.configured;
    return {
        ratio,
        label: `${counts.satisfied} of ${counts.configured} required fields complete`,
    };
}

export function buildReadinessResult(input: {
    trigger: ReadinessTrigger;
    subject: ReadinessSubject;
    context: ReadinessContext;
    gaps: ReadinessGap[];
    counts?: ReadinessCounts;
    legacy?: ReadinessResult["legacy"];
    evaluated_at?: string;
}): ReadinessResult {
    const gaps = input.gaps.filter((g) => g.scope_type === "record");
    const counts = input.counts ?? buildReadinessCountsFromGaps(gaps);
    const primary_state = derivePrimaryStateFromGaps(gaps);
    const ok = !gaps.some((g) => g.blocking);

    return {
        contract_version: READINESS_RESULT_CONTRACT_VERSION,
        primary_state,
        trigger: input.trigger,
        subject: input.subject,
        context: input.context,
        gaps,
        counts,
        ok,
        evaluated_at: input.evaluated_at,
        completion_summary: buildReadinessCompletionSummary(counts),
        legacy: input.legacy,
    };
}

export function mapEffectiveRequirementsToReadinessResult(
    effective: EffectiveRequirementsResult,
    input: {
        trigger: ReadinessTrigger;
        subject: ReadinessSubject;
        context: ReadinessContext;
        configured_rule_count?: number;
        satisfied_rule_count?: number;
        include_legacy?: boolean;
        evaluated_at?: string;
    }
): ReadinessResult {
    const gaps = mapEffectiveRequirementsToReadinessGaps(effective, input.trigger);
    const configured =
        input.configured_rule_count ??
        gaps.length + (input.satisfied_rule_count ?? 0);
    const satisfied =
        input.satisfied_rule_count ??
        Math.max(0, configured - gaps.length);

    return buildReadinessResult({
        trigger: input.trigger,
        subject: input.subject,
        context: input.context,
        gaps,
        counts: buildReadinessCountsFromGaps(gaps, { configured, satisfied }),
        legacy: input.include_legacy === false ? undefined : { effective_requirements: effective },
        evaluated_at: input.evaluated_at,
    });
}

export function buildReadinessContextFromEvalInput(input: ReadinessEvalInput): ReadinessContext {
    return {
        org_id: input.org_id,
        department_id: input.department_id ?? input.context?.department_id,
        builder_stage_key: input.context?.builder_stage_key,
        operator_stage: input.context?.operator_stage,
        action_key: input.action_key ?? input.context?.action_key ?? undefined,
        status_from: input.status_from ?? input.status ?? input.context?.status_from,
        status_to: input.status_to ?? input.context?.status_to,
        form_id: input.context?.form_id,
    };
}

export function readinessTriggerFromEvalInput(input: ReadinessEvalInput): ReadinessTrigger {
    return input.trigger;
}
