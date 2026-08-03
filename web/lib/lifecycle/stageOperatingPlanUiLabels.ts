/**
 * Operator-facing labels for stage_operating_plan_v1 editor.
 */

import type { StageJourneySegment, StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export const STAGE_JOURNEY_SEGMENT_LABELS: Record<StageJourneySegment, string> = {
    family: "Family journey (one row per family/case)",
    child: "Child journey (one row per enrollment track)",
};

export const STAGE_OUTCOME_RULE_TARGET_LABELS: Record<string, string> = {
    update_family_case_status: "Update family case status",
    update_child_enrollment_status: "Update child enrollment status",
    update_candidate_status: "Update waitlist candidate status",
    create_needs_attention: "Create Needs Attention",
    create_next_work: "Create next task",
    reopen_work: "Repeat work item",
    mark_stage_work_complete: "Mark stage work complete",
    move_to_stage: "Move to next stage",
    no_movement: "No automatic movement",
};

export function stageOutcomeRuleSummary(
    target: StageOutcomeRuleTargetV1,
    labels: Record<string, string> = STAGE_OUTCOME_RULE_TARGET_LABELS,
): string {
    const base = labels[target.kind] ?? target.kind;
    if (target.kind === "update_family_case_status" && target.status_key) {
        return `${base}: ${target.status_key.replace(/_/g, " ")}`;
    }
    if (target.kind === "update_child_enrollment_status" && target.disposition_key) {
        return `${base}: ${target.disposition_key.replace(/_/g, " ")}`;
    }
    if (target.kind === "update_candidate_status" && target.candidate_status) {
        return `${base}: ${target.candidate_status}`;
    }
    if (target.kind === "create_needs_attention" && target.attention_reason) {
        return `${base} — ${target.attention_reason}`;
    }
    if (target.kind === "move_to_stage" && target.stage_key) {
        return `${base}: ${target.stage_key.replace(/_/g, " ")}`;
    }
    return base;
}
