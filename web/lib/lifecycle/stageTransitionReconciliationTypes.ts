/**
 * Stage-transition work reconciliation — types for preflight + apply.
 */

export const STAGE_TRANSITION_RECONCILIATION_REQUIRED_ERROR = "STAGE_TRANSITION_RECONCILIATION_REQUIRED" as const;

export type StageTransitionWorkResolution = "completed" | "skipped" | "carry_forward";

export type StageTransitionAttentionResolution = "cleared" | "carry_forward";

export type StageTransitionReconciliationWorkChoice = {
    work_id: string;
    resolution: StageTransitionWorkResolution;
};

export type StageTransitionReconciliationPayload = {
    work: StageTransitionReconciliationWorkChoice[];
    attention?: StageTransitionAttentionResolution;
};

export type PriorStageOpenWorkItem = {
    work_id: string;
    title: string;
    lifecycle_stage_key: string;
    stage_label: string | null;
    template_key: string | null;
    work_definition_key: string | null;
    due_at: string | null;
};

export type StageTransitionReconciliationPreflight = {
    required: boolean;
    previous_builder_stage_key: string | null;
    next_builder_stage_key: string | null;
    previous_status_key: string | null;
    next_status_key: string;
    next_stage_label: string | null;
    open_work: PriorStageOpenWorkItem[];
    has_attention: boolean;
    attention_reason: string | null;
    wait_bucket: string | null;
};

export type ApplyStageTransitionReconciliationResult = {
    applied_work: string[];
    errors: string[];
    attention_applied: boolean;
};
