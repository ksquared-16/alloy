/**
 * Operational Question Platform — shared types for Measure-strategy questions.
 */

export type OperationalQuestionKey =
    | "future_room_capacity"
    | "room_utilization"
    | "room_utilization_fte"
    | "equivalent_child_count";

export type OperationalAnswerStrategy = "measure" | "plan" | "workspace" | "recommend";

export type OperationalQuestionCategory = "Capacity" | "Population" | "Compliance";

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
    | "continue_setup"
    | "review_children"
    | "review_capacity";

export type OperationalQuestionAction = {
    key: OperationalQuestionActionKey;
    label: string;
    href: string | null;
};

export type OperationalQuestionUnit = "seats" | "percent" | "children";

export type OperationalQuestionBosCapabilityKey =
    | "operational_question_future_room_capacity"
    | "operational_question_room_utilization"
    | "operational_question_room_utilization_fte"
    | "operational_question_equivalent_child_count";

export type OperationalQuestionDefinition = {
    key: OperationalQuestionKey;
    title: string;
    question: string;
    description: string;
    category: OperationalQuestionCategory;
    answer_strategy: OperationalAnswerStrategy;
    required_context: readonly ("organization" | "room" | "effective_date")[];
    unit: OperationalQuestionUnit;
    owner: "operational_intelligence";
    ui_route: string;
    bos_capability_key: OperationalQuestionBosCapabilityKey;
    primary_actions: readonly OperationalQuestionActionKey[];
    goal_kind: "count_min" | "rate_range";
};

export type OperationalAnswerGoal =
    | {
          kind: "count_min";
          value: number;
          label: string;
      }
    | {
          kind: "rate_range";
          min: number;
          max: number;
          label: string;
      }
    | null;

export type OperationalAnswerHealth =
    | "on_goal"
    | "below_goal"
    | "above_goal"
    | "not_available"
    | "no_goal"
    | null;

export type OperationalAnswer = {
    question_key: OperationalQuestionKey;
    question_title: string;
    strategy: OperationalAnswerStrategy;
    status: OperationalAnswerStatus;
    value: number | null;
    unit: OperationalQuestionUnit | null;
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
    presentation_lines: string[];
};

export type AnswerOperationalQuestionContext = {
    orgId: string;
    roomId?: string | null;
    roomLabel?: string | null;
    effectiveAt?: string | null;
    persistHistory?: boolean;
    entryPoint?: "ui" | "bos" | "api" | "test";
};
