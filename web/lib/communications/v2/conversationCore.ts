/**
 * Communications V2 — conversation core constants (PKG-02).
 *
 * Canonical table names + bounded vocabularies for the assignment / SLA / attention
 * foundations added by migration 20260611120000_comms_v2_conversation_core.sql.
 *
 * Non-behavioral: no UI, no provider, no send. Service wiring lands in PKG-10 (Assignment & SLA).
 * Kept in sync with the migration; asserted by commsV2ConversationCoreSchema.test.ts.
 */

export const COMMS_V2_CONVERSATION_TABLES = {
    threads: "communication_threads",
    assignmentEvents: "conversation_assignment_events",
    slaEvents: "sla_events",
} as const;

/** Bounded assignment state (DB check constraint communication_threads_assignment_state_chk). */
export const CONVERSATION_ASSIGNMENT_STATES = ["unassigned", "assigned"] as const;
export type ConversationAssignmentState = (typeof CONVERSATION_ASSIGNMENT_STATES)[number];

/** Assignment audit action vocabulary (enforced at the service layer in PKG-10). */
export const CONVERSATION_ASSIGNMENT_ACTIONS = ["claim", "assign", "reassign", "unassign", "route"] as const;
export type ConversationAssignmentAction = (typeof CONVERSATION_ASSIGNMENT_ACTIONS)[number];

/** SLA audit type vocabulary (service layer in PKG-10 owns transitions). */
export const SLA_EVENT_TYPES = ["first_response", "response", "stale"] as const;
export type SlaEventType = (typeof SLA_EVENT_TYPES)[number];

/** Columns added to communication_threads in PKG-02 (sync with migration; asserted by the schema test). */
export const COMMS_V2_THREAD_CORE_COLUMNS = [
    "assigned_user_id",
    "assigned_team_id",
    "assignment_state",
    "attention_state",
    "first_response_at",
    "sla_due_at",
    "sla_state",
    "last_read_at",
] as const;
export type CommsV2ThreadCoreColumn = (typeof COMMS_V2_THREAD_CORE_COLUMNS)[number];
