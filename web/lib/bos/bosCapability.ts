/**
 * BOS capability registry types — contracts only (Phase 2 registry population).
 * @see docs/product/bos-foundation.md
 */

export type BosCapabilityKey =
    | "orchestrator"
    | "task_assist"
    | "workflow_assist"
    | "config_layout_assist"
    | "needs_attention_suggestion"
    | "attention_enrich"
    | "job_overview_layout"
    | "agent_v0_queue_definition"
    | "agent_v1_record_overview_layout"
    | "agent_v2_field_visibility";

export type BosCapabilityClass = "orchestration" | "config" | "operational" | "insight";

export type BosReadClass =
    | "config_inventory"
    | "resolver_entity"
    | "workspace_metadata"
    | "workflow_read"
    | "communications_context";

export type BosWriteClass =
    | "none"
    | "config_api"
    | "definer_rpc"
    | "operational_api"
    | "workflow_crud";

export type BosProposalPersistence = "none" | "ephemeral" | "durable_table";

export type BosCapabilityDefinition = {
    capability_key: BosCapabilityKey;
    capability_class: BosCapabilityClass;
    display_name: string;
    /** Legacy `agent_key` values emitted in proposal payloads. */
    legacy_agent_keys?: readonly string[];
    read_classes: readonly BosReadClass[];
    write_class: BosWriteClass;
    org_policy_features: readonly string[];
    propose_permission_keys: readonly string[];
    apply_permission_keys: readonly string[];
    proposal_persistence: BosProposalPersistence;
    durable_table?: string;
    apply_route_family?: string;
    requires_human_approval: boolean;
};

export type BosProposalStatus =
    | "draft"
    | "validated"
    | "approved"
    | "applied"
    | "rejected"
    | "superseded"
    | "failed"
    | "expired";

export type BosProposalEnvelopeV1 = {
    version: 1;
    capability_key: BosCapabilityKey;
    proposal_id: string;
    org_id: string;
    actor_user_id: string;
    generated_at_iso: string;
    source_surface: string;
    status: BosProposalStatus;
    payload: unknown;
    correlation_id?: string | null;
    request_id?: string | null;
};
