import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

/** Frozen Operational Work metadata contract version (PR1). */
export const OPERATIONAL_WORK_FRAMEWORK_VERSION = 1 as const;

/** V1 runtime supports task-shaped work only. */
export type OperationalWorkShape = "task";

export type OperationalWorkDedupePolicy = "none" | "definition_subject" | "definition_subject_period";

export type OperationalWorkSubject = {
    entityType: "opportunities" | null;
    entityId: string | null;
};

export type OperationalWorkCategory =
    | "information_collection"
    | "review"
    | "follow_up"
    | "decision"
    | "resolution"
    | "compliance"
    | "coordination"
    | "other";

/** Provenance sources for instantiate; legacy column maps manual | task_assist only. */
export type OperationalWorkInstantiateProvenanceSource =
    | "manual"
    | "task_assist"
    | "task_assist_apply"
    | "workflow"
    | "recurrence"
    | "system"
    | "lifecycle_template";

/** Stored provenance on persisted metadata (normalized). */
export type OperationalWorkProvenanceSource =
    | "manual"
    | "task_assist"
    | "workflow"
    | "recurrence"
    | "system"
    | "lifecycle_template";

export type OperationalWorkInstantiateProvenance = {
    source: OperationalWorkInstantiateProvenanceSource;
    proposal_id?: string;
    workflow_run_id?: string;
    idempotency_key?: string;
    /** Staff user who triggered the workflow event, when known — not owner fallback. */
    created_by_user_id?: string;
    /** User id passed to instantiate service (actor or record-owner fallback). */
    executor_user_id?: string;
    workflow_id?: string;
    workflow_action_order?: number;
    workflow_action_id?: string;
    workflow_event_id?: string;
    workflow_event_type?: string;
    workflow_subject_mapping_mode?: string;
    workflow_action_payload_version?: number;
};

export type OperationalWorkProvenance = {
    source: OperationalWorkProvenanceSource;
    proposal_id?: string;
    workflow_run_id?: string;
    idempotency_key?: string;
    created_by_user_id?: string;
    executor_user_id?: string;
    workflow_id?: string;
    workflow_action_order?: number;
    workflow_action_id?: string;
    workflow_event_id?: string;
    workflow_event_type?: string;
    workflow_subject_mapping_mode?: string;
    workflow_action_payload_version?: number;
};

export type OperationalWorkContextSnapshot = {
    readiness_gap_ids?: string[];
    attention_reason_codes?: string[];
    lifecycle_stage_key?: string;
    event_type?: string;
};

/** Canonical metadata bag stored in operational_tasks.metadata (jsonb). */
export type OperationalWorkMetadataV1 = {
    work_framework_version: typeof OPERATIONAL_WORK_FRAMEWORK_VERSION;
    shape: OperationalWorkShape;
    category?: OperationalWorkCategory;
    work_definition_key?: string;
    subject_fingerprint?: string;
    dedupe_period_key?: string;
    dedupe_key?: string;
    provenance: OperationalWorkProvenance;
    context_snapshot?: OperationalWorkContextSnapshot;
    suggested_action_keys?: string[];
};

export type InstantiateWorkResult =
    | {
          status: "created";
          work: OperationalWorkInstanceRow;
          dedupeKey: string | null;
      }
    | {
          status: "deduped";
          existingWork: OperationalWorkInstanceRow;
          dedupeKey: string;
          reason: string;
      }
    | {
          status: "aggregated";
          work: OperationalWorkInstanceRow;
          dedupeKey: string;
          reason: string;
      }
    | {
          status: "rejected";
          reason: string;
          error: string;
          message: string;
          dedupeKey: null;
      };

/** Normalized work view derived from a task-shaped persistence row. */
export type OperationalWorkView = {
    framework_version: typeof OPERATIONAL_WORK_FRAMEWORK_VERSION;
    shape: OperationalWorkShape;
    category: OperationalWorkCategory | null;
    work_definition_key: string | null;
    provenance: OperationalWorkProvenance;
    context_snapshot: OperationalWorkContextSnapshot | null;
};

/** Task-shaped work instance — persistence row plus parsed framework view. */
export type OperationalWorkInstanceRow = OperationalTaskRow & {
    work: OperationalWorkView;
};

export type OperationalWorkWorkspaceFilter =
    | "open"
    | "due_today"
    | "overdue"
    | "completed"
    | "all"
    | "assigned_to_me"
    | "unassigned";
