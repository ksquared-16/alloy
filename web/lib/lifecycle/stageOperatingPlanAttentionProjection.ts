/**
 * Project stage_operating_plan_v1 attention rule evaluation → resolver reason codes.
 */

import type {
    StageAttentionEvalKind,
    StageAttentionFiredRule,
} from "@/lib/lifecycle/evaluateStageOperatingPlanAttention";
import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

export type StageAttentionProjectedReasonCode =
    | "stage_work_overdue"
    | "stage_age_exceeded"
    | "stage_missing_required_fields"
    | "stage_attempts_incomplete";

export type ProjectedStageAttentionReason = {
    code: StageAttentionProjectedReasonCode;
    label: string;
    severity: OpportunityAttentionSeverity;
    source: "stage_plan";
    provenance: string;
    stage_attention_rule_key: string;
    stage_attention_rule_kind: StageAttentionEvalKind;
    stage_attention_rule_label: string;
};

const CODE_BY_EVAL_KIND: Record<StageAttentionEvalKind, StageAttentionProjectedReasonCode> = {
    work_overdue: "stage_work_overdue",
    stage_age_exceeded: "stage_age_exceeded",
    missing_required_fields: "stage_missing_required_fields",
    attempts_incomplete: "stage_attempts_incomplete",
};

function severityRank(s: OpportunityAttentionSeverity): number {
    switch (s) {
        case "critical":
            return 4;
        case "high":
            return 3;
        case "medium":
            return 2;
        case "low":
            return 1;
        default:
            return 0;
    }
}

function mapStageSeverity(severity: StageAttentionFiredRule["severity"]): OpportunityAttentionSeverity {
    if (severity === "high") return "high";
    if (severity === "low") return "low";
    return "medium";
}

export function stageAttentionReasonCodeForEvalKind(
    kind: StageAttentionEvalKind,
): StageAttentionProjectedReasonCode {
    return CODE_BY_EVAL_KIND[kind];
}

export function isStageAttentionProjectedReasonCode(
    code: string,
): code is StageAttentionProjectedReasonCode {
    return (
        code === "stage_work_overdue" ||
        code === "stage_age_exceeded" ||
        code === "stage_missing_required_fields" ||
        code === "stage_attempts_incomplete"
    );
}

/** Map fired stage rules to projected attention reasons (one per rule). */
export function projectStagePlanToAttentionReasons(
    fired: StageAttentionFiredRule[],
): ProjectedStageAttentionReason[] {
    return fired.map((rule) => ({
        code: stageAttentionReasonCodeForEvalKind(rule.kind),
        label: rule.label,
        severity: mapStageSeverity(rule.severity),
        source: "stage_plan",
        provenance: rule.provenance,
        stage_attention_rule_key: rule.rule_key,
        stage_attention_rule_kind: rule.kind,
        stage_attention_rule_label: rule.label,
    }));
}

/** Sort projected + platform reasons by configured priority (stage rules rank high). */
export function sortAttentionReasonsByPriority(
    reasons: Array<{ code: OpportunityAttentionReasonCode; severity: OpportunityAttentionSeverity }>,
    priorityOrder: readonly OpportunityAttentionReasonCode[],
): void {
    const idx = new Map(priorityOrder.map((c, i) => [c, i]));
    reasons.sort((a, b) => {
        const ia = idx.get(a.code) ?? 1000;
        const ib = idx.get(b.code) ?? 1000;
        if (ia !== ib) return ia - ib;
        const sa = severityRank(b.severity) - severityRank(a.severity);
        if (sa !== 0) return sa;
        return a.code.localeCompare(b.code);
    });
}
