import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";

/** @deprecated Use `"planned"` — `"none"` retained for backward compat during migration. */
export type WorkIntentRuntimeState = "planned" | "open" | "completed" | "none";

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
    /**
     * Present ONLY on a child-grain plan whose caller named no child. The subject is truthful about
     * the family case and the grain, and carries no child — so it cannot be executed, and the outcome
     * path refuses it. A surface reading this can decline to offer the action instead of offering one
     * that fails at the guard. Absent means the subject is complete for its grain.
     */
    subject_unresolved?: "child_identity_required";
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
