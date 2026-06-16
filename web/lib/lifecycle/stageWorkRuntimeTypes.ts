import type {
    WorkIntentDueUrgency,
    WorkIntentRuntimeExecutionBundle,
    WorkIntentRuntimeLastOutcome,
    WorkIntentRuntimeOutcome,
    WorkIntentRuntimeProjection,
    WorkIntentRuntimeState,
} from "@/lib/lifecycle/workIntentRuntimeTypes";

export type StageWorkOutcomeAutomationPreview = {
    outcome_key: string;
    outcome_label: string;
    effect_label: string;
};

export type StageWorkItemProjection = {
    template_key: string;
    label: string;
    role: "primary" | "secondary";
    state: WorkIntentRuntimeState;
    work_id: string | null;
    due_at: string | null;
    due_urgency: WorkIntentDueUrgency;
    attempt_count: number;
    last_outcome: WorkIntentRuntimeLastOutcome | null;
    completed_at: string | null;
    outcomes: WorkIntentRuntimeOutcome[];
    completion_policy_summary: string | null;
    completion_policy_min_attempts: number | null;
    completion_policy_max_attempts: number | null;
    outcome_automation_preview: StageWorkOutcomeAutomationPreview[];
};

export type StageWorkRuntimeProjection = {
    stage_key: string;
    stage_label: string | null;
    purpose: string | null;
    journey_segment: "family" | "child";
    template_keys: string[];
    primary: StageWorkItemProjection | null;
    additional: StageWorkItemProjection[];
    execution: WorkIntentRuntimeExecutionBundle;
};

/** Primary work intent projection — backward compat for existing consumers. */
export function primaryWorkIntentProjectionFromStageWork(
    runtime: StageWorkRuntimeProjection | null,
): WorkIntentRuntimeProjection | null {
    if (!runtime?.primary) return null;
    const item = runtime.primary;
    return {
        state: item.state,
        stage_key: runtime.stage_key,
        work_intent_key: item.template_key,
        label: item.label,
        journey_segment: runtime.journey_segment,
        work_id: item.work_id,
        due_at: item.due_at,
        due_urgency: item.due_urgency,
        attempt_count: item.attempt_count,
        last_outcome: item.last_outcome,
        completed_at: item.completed_at,
        outcomes: item.outcomes,
        execution: runtime.execution,
        completion_policy_summary: item.completion_policy_summary,
        completion_policy_min_attempts: item.completion_policy_min_attempts,
        completion_policy_max_attempts: item.completion_policy_max_attempts,
    };
}

/** Map a stage work item + runtime bundle to legacy outcome completion projection. */
export function workIntentProjectionForStageWorkItem(
    runtime: StageWorkRuntimeProjection,
    item: StageWorkItemProjection,
): WorkIntentRuntimeProjection {
    return {
        state: item.state,
        stage_key: runtime.stage_key,
        work_intent_key: item.template_key,
        label: item.label,
        journey_segment: runtime.journey_segment,
        work_id: item.work_id,
        due_at: item.due_at,
        due_urgency: item.due_urgency,
        attempt_count: item.attempt_count,
        last_outcome: item.last_outcome,
        completed_at: item.completed_at,
        outcomes: item.outcomes,
        execution: runtime.execution,
        completion_policy_summary: item.completion_policy_summary,
        completion_policy_min_attempts: item.completion_policy_min_attempts,
        completion_policy_max_attempts: item.completion_policy_max_attempts,
    };
}
