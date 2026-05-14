export const TASK_ASSIST_AGENT_KEY = "task_assist" as const;

/** Catalog-owned; server maps to validation + apply branches. */
export type TaskAssistTaskTypeV1 =
    | "draft_sms"
    | "draft_email"
    | "draft_in_app"
    | "set_opportunity_follow_up";

export type TaskAssistRecipientCandidateV1 = {
    person_id: string;
    display_label: string;
    /** Hints for UI only — apply path re-resolves phone/email server-side. */
    has_sms: boolean;
    has_email: boolean;
};

export type TaskAssistSelectedRecipientV1 = {
    person_id: string;
};

/** What the operator confirmed Apply should do — re-validated server-side. */
export type TaskAssistApplyIntentV1 =
    | { kind: "send_communication_now" }
    | { kind: "set_opportunity_follow_up"; follow_up_at_iso: string }
    | { kind: "none" };

export type TaskAssistConfidenceV1 =
    | { mode: "deterministic" }
    | { mode: "model_assisted"; score?: number; notes?: string | null };

export type TaskAssistSuggestionV1 = {
    version: 1;
    agent_key: typeof TASK_ASSIST_AGENT_KEY;

    /** Deterministic id for ephemeral proposals (hash of org + entity + task_type + content hash + time bucket), or future DB id. */
    suggestion_id: string;
    generated_at_iso: string;

    org_id: string;
    actor_user_id: string;

    /** Where the proposal was built, e.g. `opportunity_drawer`, `job_drawer`, `command_surface`. */
    source_surface: string;

    task_type: TaskAssistTaskTypeV1;

    /** Primary anchor entity — V1: `opportunities` only (see sprint Card 0). */
    entity_type: "opportunities";
    entity_id: string;

    /** Short non-PII summary for UI header / logs (no child names in structured logs if policy forbids). */
    context_summary: string;

    recipient_candidates: TaskAssistRecipientCandidateV1[];

    /** Null until user selects exactly one candidate in UI. */
    selected_recipient: TaskAssistSelectedRecipientV1 | null;

    channel: "sms" | "email" | "in_app";

    draft_subject: string | null;
    draft_body: string;

    /** V1.1+ scheduling; MUST be null in V1 core ship. */
    scheduled_for_iso: string | null;

    /** Optional; opportunities only — V1 validators require null (follow-up deferred). */
    reminder_due_at_iso: string | null;

    assumptions: string[];
    missing_inputs: string[];
    warnings: string[];
    validation_errors: string[];

    confidence: TaskAssistConfidenceV1;

    /** Always true for mutating apply intents; server may reject if false. */
    approval_required: boolean;

    apply_intent: TaskAssistApplyIntentV1;
};

/** Entity types Task Assist V1 apply validators accept. */
export const TASK_ASSIST_V1_ENTITY_TYPES = ["opportunities"] as const;
export type TaskAssistV1EntityType = (typeof TASK_ASSIST_V1_ENTITY_TYPES)[number];

/** Channels allowed for send apply in V1 (`in_app` deferred). */
export const TASK_ASSIST_V1_SEND_CHANNELS = ["sms", "email"] as const;
export type TaskAssistV1SendChannel = (typeof TASK_ASSIST_V1_SEND_CHANNELS)[number];
