import type { InstantiateWorkWorkflowActionPayloadV1 } from "@/lib/admin/operationalWork/workflowInstantiateWork/types";

/** Stable seed identifier stored in `workflows.metadata.seed_key`. */
export const ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_KEY = "c4_enrollment_record_tour_outcome_v1" as const;

/** Human-readable workflow name — must match migration seed row. */
export const ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME =
    "Enrollment: Record tour outcome on tour scheduled" as const;

/**
 * Trigger: opportunity moves to `tour_scheduled` (tour confirmed).
 *
 * We use `tour_scheduled` rather than `tour_completed` because `record_tour_outcome`
 * admin actions set status to `tour_completed` — firing on completion would create
 * redundant "record outcome" work after the outcome was just captured.
 */
export const ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE = "opportunity_status_changed" as const;

export const ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE = "opportunities" as const;

export const ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY = "tour_scheduled" as const;

export const ENROLLMENT_RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY = "record_tour_outcome" as const;

export const ENROLLMENT_RECORD_TOUR_OUTCOME_INSTANTIATE_WORK_PAYLOAD: InstantiateWorkWorkflowActionPayloadV1 = {
    version: 1,
    work_definition_key: ENROLLMENT_RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY,
    subject: { mode: "event_primary_entity" },
    context_snapshot: { lifecycle_stage_key: "tour" },
    on_deduped: "soft_success",
    on_disabled_definition: "skip",
    on_rejected: "fail",
};

export type EnrollmentRecordTourOutcomeWorkflowSeedSpec = {
    seedKey: typeof ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_KEY;
    name: typeof ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME;
    eventType: typeof ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE;
    entityType: typeof ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE;
    conditionField: "new_status_key";
    conditionOperator: "eq";
    conditionValue: typeof ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY;
    actionType: "instantiate_work";
    actionOrder: 1;
    instantiateWorkPayload: InstantiateWorkWorkflowActionPayloadV1;
};

/** Canonical C4 seed spec — tests and migration must stay aligned. */
export const ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_SPEC: EnrollmentRecordTourOutcomeWorkflowSeedSpec = {
    seedKey: ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_SEED_KEY,
    name: ENROLLMENT_RECORD_TOUR_OUTCOME_WORKFLOW_NAME,
    eventType: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_EVENT_TYPE,
    entityType: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_ENTITY_TYPE,
    conditionField: "new_status_key",
    conditionOperator: "eq",
    conditionValue: ENROLLMENT_RECORD_TOUR_OUTCOME_TRIGGER_STATUS_KEY,
    actionType: "instantiate_work",
    actionOrder: 1,
    instantiateWorkPayload: ENROLLMENT_RECORD_TOUR_OUTCOME_INSTANTIATE_WORK_PAYLOAD,
};
