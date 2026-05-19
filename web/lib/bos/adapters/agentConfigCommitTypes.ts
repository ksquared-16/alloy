/**
 * Native payload shapes for legacy admin/agent config commits (v0–v2).
 * Adapters wrap these without altering RPC or route behavior.
 */

export type AgentV0QueueDefinitionCommitPayloadV1 = {
    proposal_id: string;
    org_id: string;
    actor_user_id: string;
    intent_id: string;
    intent_version: number;
    intent_type: "update_queue_definition";
    slots: {
        work_unit_id: string;
        queue_definition: unknown;
        expected_queue_definition_version: number;
    };
    correlation_id?: string | null;
    request_id?: string | null;
    created_at?: string;
};

export type AgentV1RecordOverviewLayoutCommitPayloadV1 = {
    proposal_id: string;
    org_id: string;
    actor_user_id: string;
    intent_id: string;
    intent_version: number;
    intent_type: "update_record_layout";
    slots: {
        target_kind: "record_overview_layout";
        entity_type: "job";
        surface: "overview";
        config: unknown;
        expected_config_version: number;
    };
    correlation_id?: string | null;
    request_id?: string | null;
    created_at?: string;
};

export type AgentV2FieldVisibilityCommitPayloadV1 = {
    proposal_id: string;
    org_id: string;
    actor_user_id: string;
    intent_id: string;
    intent_version: number;
    intent_type: "update_field_visibility";
    slots: {
        target_kind: "field_definition_visibility";
        field_definition_id: string;
        expected_updated_at: string;
        visibility_patch: unknown;
    };
    correlation_id?: string | null;
    request_id?: string | null;
    created_at?: string;
};
