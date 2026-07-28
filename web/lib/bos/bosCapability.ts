/**
 * BOS capability registry types.
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
    | "agent_v2_field_visibility"
    | "packet_review_insight"
    | "operational_question_future_room_capacity"
    | "operational_question_room_utilization";

/** Product domain for routing, policy, and UI grouping. */
export type BosCapabilityDomain = "orchestration" | "config" | "operational" | "insight";

export type BosProposalMode = "none" | "ephemeral" | "durable";

export type BosApplyPolicy =
    | "none"
    | "preview_only"
    | "human_approved_operational_api"
    | "human_approved_workflow_crud"
    | "human_approved_config_api"
    | "human_approved_definer_rpc";

export type BosRiskLevel = "none" | "low" | "medium" | "high";

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

/** @deprecated Use BosCapabilityDomain — retained for registry consumers migrating from Phase 1. */
export type BosCapabilityClass = BosCapabilityDomain;

/** @deprecated Use BosProposalMode — retained for Phase 1 imports. */
export type BosProposalPersistence = "none" | "ephemeral" | "durable_table";

export type BosCapabilityDefinition = {
    capability_key: BosCapabilityKey;
    /** Operator-facing label. */
    label: string;
    domain: BosCapabilityDomain;
    proposal_mode: BosProposalMode;
    apply_policy: BosApplyPolicy;
    /** Default risk when proposal does not specify (insight/orchestration → none). */
    default_risk_level: BosRiskLevel;
    requires_human_approval: boolean;
    /** Legacy `agent_key` values in native proposal payloads. */
    legacy_agent_keys: readonly string[];
    read_classes: readonly BosReadClass[];
    write_class: BosWriteClass;
    org_policy_features: readonly string[];
    propose_permission_keys: readonly string[];
    apply_permission_keys: readonly string[];
    durable_table?: string;
    apply_route_family?: string;
    /** Implementation modules (documentation / future UI drill-down). */
    source_modules: readonly string[];
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
