/**
 * Operational Question Platform — shared types for the Future Room Capacity proving slice.
 * @see docs/sprints/07_2026/operational-calculations-product-realization/OPERATIONAL-QUESTION-PLATFORM.md
 */

export type OperationalQuestionKey = "future_room_capacity";

export type OperationalAnswerStrategy = "measure" | "plan" | "workspace" | "recommend";

export type OperationalQuestionCategory = "Capacity";

export type OperationalAnswerStatus =
    | "answered"
    | "not_available"
    | "configuration_required"
    | "invalid_context"
    | "unauthorized";

export type OperationalQuestionActionKey =
    | "view_room"
    | "review_history"
    | "change_goal"
    | "manage_measurement"
    | "explain_answer"
    | "use_newer_source_version"
    | "start_measuring"
    | "continue_setup";

export type OperationalQuestionAction = {
    key: OperationalQuestionActionKey;
    label: string;
    /** Relative admin href or null when BOS/UI handles inline */
    href: string | null;
};

export type OperationalQuestionDefinition = {
    key: OperationalQuestionKey;
    title: string;
    question: string;
    description: string;
    category: OperationalQuestionCategory;
    answer_strategy: OperationalAnswerStrategy;
    required_context: readonly ("organization" | "room" | "effective_date")[];
    unit: "seats";
    owner: "operational_intelligence";
    ui_route: string;
    bos_capability_key: "operational_question_future_room_capacity";
    primary_actions: readonly OperationalQuestionActionKey[];
};

export type OperationalAnswerGoal = {
    kind: "count_min";
    value: number;
    label: string;
} | null;

export type OperationalAnswerHealth = "on_goal" | "below_goal" | "not_available" | "no_goal" | null;

export type OperationalAnswer = {
    question_key: OperationalQuestionKey;
    question_title: string;
    strategy: OperationalAnswerStrategy;
    status: OperationalAnswerStatus;
    value: number | null;
    unit: "seats" | null;
    subject: {
        room_id: string | null;
        room_label: string | null;
    };
    effective_date: string | null;
    answered_at: string | null;
    availability: "available" | "not_available" | "unknown";
    availability_reason: string | null;
    goal: OperationalAnswerGoal;
    health: OperationalAnswerHealth;
    source_summary: string | null;
    version_summary: string | null;
    explanation_summary: string[];
    history_available: boolean;
    measurement_id: string | null;
    actions: OperationalQuestionAction[];
    /** Operator-facing conversational lines (BOS); UI may ignore */
    presentation_lines: string[];
};

export type AnswerOperationalQuestionContext = {
    orgId: string;
    roomId?: string | null;
    roomLabel?: string | null;
    effectiveAt?: string | null;
    /** When true, persist observation history (Measure strategy). Default true for answer requests with room+date. */
    persistHistory?: boolean;
    /** Audit only — must not change answer semantics */
    entryPoint?: "ui" | "bos" | "api" | "test";
};
