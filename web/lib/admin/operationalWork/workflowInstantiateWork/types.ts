import type { OperationalWorkInstantiateProvenance } from "@/lib/admin/operationalWork/operationalWorkTypes";

/** Registered workflow action type — Phase C instantiate_work. */
export const INSTANTIATE_WORK_WORKFLOW_ACTION_TYPE = "instantiate_work" as const;

export type InstantiateWorkWorkflowFailurePolicy = "skip" | "fail";

export type InstantiateWorkWorkflowDedupedPolicy = "soft_success" | "fail";

export type InstantiateWorkWorkflowSubjectEntityType = "opportunities" | null;

export type InstantiateWorkWorkflowSubjectMappingEventPrimary = {
    mode: "event_primary_entity";
};

export type InstantiateWorkWorkflowSubjectMappingPath = {
    mode: "path";
    entity_type: InstantiateWorkWorkflowSubjectEntityType;
    entity_id_path: string;
};

export type InstantiateWorkWorkflowSubjectMappingStatic = {
    mode: "static";
    entity_type: InstantiateWorkWorkflowSubjectEntityType;
    entity_id: string | null;
};

export type InstantiateWorkWorkflowSubjectMappingV1 =
    | InstantiateWorkWorkflowSubjectMappingEventPrimary
    | InstantiateWorkWorkflowSubjectMappingPath
    | InstantiateWorkWorkflowSubjectMappingStatic;

export type InstantiateWorkWorkflowActionPayloadV1 = {
    version: 1;
    work_definition_key: string;
    subject: InstantiateWorkWorkflowSubjectMappingV1;
    title?: string;
    description?: string;
    due_at?: string;
    assigned_to_user_id?: string;
    context_snapshot?: Record<string, unknown>;
    period_key?: string;
    on_disabled_definition: InstantiateWorkWorkflowFailurePolicy;
    on_deduped: InstantiateWorkWorkflowDedupedPolicy;
    on_rejected: InstantiateWorkWorkflowFailurePolicy;
};

/** Provenance bundle for workflow instantiate_work — C2 maps subset into service calls. */
export type InstantiateWorkWorkflowProvenanceV1 = OperationalWorkInstantiateProvenance & {
    source: "workflow";
    workflow_run_id: string;
    workflow_id?: string;
    event_id?: string;
    idempotency_key: string;
};

export type ParsedInstantiateWorkWorkflowActionPayloadResult =
    | { ok: true; payload: InstantiateWorkWorkflowActionPayloadV1 }
    | { ok: false; error: string; message: string; reason: string };

export type ResolvedInstantiateWorkWorkflowSubjectResult =
    | {
          ok: true;
          subject: { entityType: "opportunities" | null; entityId: string | null };
          subjectFingerprint: string;
      }
    | { ok: false; error: string; message: string; reason: string };
