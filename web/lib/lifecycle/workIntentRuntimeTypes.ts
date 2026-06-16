import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";

export type WorkIntentRuntimeState = "open" | "completed" | "none";

export type WorkIntentDueUrgency = "overdue" | "due_today" | "upcoming" | "none";

export type WorkIntentRuntimeOutcome = {
    outcome_key: string;
    label: string;
    successful?: boolean;
};

export type WorkIntentRuntimeLastOutcome = {
    outcome_key: string;
    label: string;
    at: string | null;
};

export type WorkIntentRuntimeExecutionBundle = {
    department_id: string;
    requires_outcome_picker: boolean;
    subject: StageOutcomeExecutionSubject;
};

export type WorkIntentRuntimeProjection = {
    state: WorkIntentRuntimeState;
    stage_key: string;
    work_intent_key: string;
    label: string;
    journey_segment: "family" | "child";
    work_id: string | null;
    due_at: string | null;
    due_urgency: WorkIntentDueUrgency;
    attempt_count: number;
    last_outcome: WorkIntentRuntimeLastOutcome | null;
    completed_at: string | null;
    outcomes: WorkIntentRuntimeOutcome[];
    execution: WorkIntentRuntimeExecutionBundle;
    /** Human-readable completion policy for active work template. */
    completion_policy_summary?: string | null;
    completion_policy_min_attempts?: number | null;
    completion_policy_max_attempts?: number | null;
};
