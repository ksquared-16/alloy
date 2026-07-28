/**
 * Static catalog of shipped BOS capabilities (Phase 1 audit).
 * @see docs/sprints/archive/05_2026/bos_standardization_audit.md
 */

import type { BosCapabilityDefinition, BosCapabilityKey } from "@/lib/bos/bosCapability";

export const BOS_CAPABILITY_REGISTRY: readonly BosCapabilityDefinition[] = [
    {
        capability_key: "orchestrator",
        label: "Orchestrator",
        domain: "orchestration",
        proposal_mode: "none",
        apply_policy: "none",
        default_risk_level: "none",
        requires_human_approval: false,
        legacy_agent_keys: [],
        read_classes: ["resolver_entity", "workspace_metadata", "workflow_read", "config_inventory"],
        write_class: "none",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        source_modules: [
            "web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts",
            "web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        ],
    },
    {
        capability_key: "task_assist",
        label: "Task Assist",
        domain: "operational",
        proposal_mode: "durable",
        apply_policy: "human_approved_operational_api",
        default_risk_level: "medium",
        requires_human_approval: true,
        legacy_agent_keys: ["task_assist"],
        read_classes: ["resolver_entity", "communications_context"],
        write_class: "operational_api",
        org_policy_features: ["task_assist_draft"],
        propose_permission_keys: ["ai.enrichment.use"],
        apply_permission_keys: [],
        durable_table: "task_assist_proposals",
        apply_route_family: "/api/admin/ai/task-assist",
        source_modules: ["web/lib/agent/taskAssist/"],
    },
    {
        capability_key: "workflow_assist",
        label: "Workflow Assist",
        domain: "config",
        proposal_mode: "ephemeral",
        apply_policy: "human_approved_workflow_crud",
        default_risk_level: "high",
        requires_human_approval: true,
        legacy_agent_keys: ["workflow_assist"],
        read_classes: ["workflow_read", "resolver_entity"],
        write_class: "workflow_crud",
        org_policy_features: ["workflow_assist_draft"],
        propose_permission_keys: ["ai.enrichment.use"],
        apply_permission_keys: [],
        apply_route_family: "/api/admin/ai/workflow-assist",
        source_modules: ["web/lib/agent/workflowAssist/"],
    },
    {
        capability_key: "config_layout_assist",
        label: "Config / Layout Assist",
        domain: "config",
        proposal_mode: "durable",
        apply_policy: "human_approved_config_api",
        default_risk_level: "medium",
        requires_human_approval: true,
        legacy_agent_keys: ["config_layout_assist"],
        read_classes: ["config_inventory"],
        write_class: "config_api",
        org_policy_features: [],
        propose_permission_keys: ["config_assist.generate"],
        apply_permission_keys: ["config_assist.review", "config_assist.apply"],
        durable_table: "config_layout_assist_proposals",
        apply_route_family: "/api/admin/ai/config-layout-assist",
        source_modules: ["web/lib/agent/configLayoutAssist/"],
    },
    {
        capability_key: "needs_attention_suggestion",
        label: "Needs Attention Suggestion",
        domain: "insight",
        proposal_mode: "ephemeral",
        apply_policy: "none",
        default_risk_level: "none",
        requires_human_approval: false,
        legacy_agent_keys: ["needs_attention_suggestion"],
        read_classes: ["resolver_entity", "workspace_metadata"],
        write_class: "none",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        source_modules: ["web/lib/agent/needsAttentionSuggestion/"],
    },
    {
        capability_key: "attention_enrich",
        label: "Attention Enrich",
        domain: "insight",
        proposal_mode: "none",
        apply_policy: "preview_only",
        default_risk_level: "low",
        requires_human_approval: false,
        legacy_agent_keys: [],
        read_classes: ["resolver_entity"],
        write_class: "none",
        org_policy_features: ["draft_enrichment"],
        propose_permission_keys: ["ai.enrichment.use"],
        apply_permission_keys: [],
        apply_route_family: "/api/admin/ai/enrich-attention-suggestion",
        source_modules: ["web/lib/ai/"],
    },
    {
        capability_key: "job_overview_layout",
        label: "Job Overview Layout",
        domain: "config",
        proposal_mode: "ephemeral",
        apply_policy: "human_approved_definer_rpc",
        default_risk_level: "medium",
        requires_human_approval: true,
        legacy_agent_keys: [],
        read_classes: ["config_inventory"],
        write_class: "definer_rpc",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        apply_route_family: "/api/admin/agent/v1",
        source_modules: ["web/lib/agent/planner/"],
    },
    {
        capability_key: "agent_v0_queue_definition",
        label: "Config commit — queue definition (v0)",
        domain: "config",
        proposal_mode: "durable",
        apply_policy: "human_approved_definer_rpc",
        default_risk_level: "medium",
        requires_human_approval: true,
        legacy_agent_keys: [],
        read_classes: ["workspace_metadata", "config_inventory"],
        write_class: "definer_rpc",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        durable_table: "agent_v0_proposals",
        apply_route_family: "/api/admin/agent/v0",
        source_modules: ["web/lib/agent/v0/"],
    },
    {
        capability_key: "agent_v1_record_overview_layout",
        label: "Config commit — record overview layout (v1)",
        domain: "config",
        proposal_mode: "durable",
        apply_policy: "human_approved_definer_rpc",
        default_risk_level: "medium",
        requires_human_approval: true,
        legacy_agent_keys: [],
        read_classes: ["config_inventory"],
        write_class: "definer_rpc",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        durable_table: "agent_v1_proposals",
        apply_route_family: "/api/admin/agent/v1",
        source_modules: ["web/lib/agent/v1/"],
    },
    {
        capability_key: "agent_v2_field_visibility",
        label: "Config commit — field visibility (v2)",
        domain: "config",
        proposal_mode: "durable",
        apply_policy: "human_approved_definer_rpc",
        default_risk_level: "low",
        requires_human_approval: true,
        legacy_agent_keys: [],
        read_classes: ["config_inventory"],
        write_class: "definer_rpc",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        durable_table: "agent_v2_proposals",
        apply_route_family: "/api/admin/agent/v2",
        source_modules: ["web/lib/agent/v2/"],
    },
    {
        capability_key: "packet_review_insight",
        label: "Packet review insight",
        domain: "insight",
        proposal_mode: "ephemeral",
        apply_policy: "none",
        default_risk_level: "none",
        requires_human_approval: false,
        legacy_agent_keys: [],
        read_classes: ["workflow_read"],
        write_class: "none",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        source_modules: [
            "web/lib/forms/packets/buildPacketReviewInsightV1.ts",
            "web/app/api/admin/forms/packet-sessions/[packetSessionId]/review-insight/route.ts",
        ],
    },
    {
        capability_key: "operational_question_future_room_capacity",
        label: "Future Room Capacity",
        domain: "operational",
        proposal_mode: "none",
        apply_policy: "human_approved_operational_api",
        default_risk_level: "low",
        requires_human_approval: false,
        legacy_agent_keys: [],
        read_classes: ["resolver_entity", "workspace_metadata"],
        write_class: "operational_api",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        apply_route_family: "/api/admin/operational-questions",
        source_modules: [
            "web/lib/operationalQuestions/",
            "web/app/api/admin/operational-questions/",
        ],
    },
    {
        capability_key: "operational_question_room_utilization",
        label: "Room Utilization",
        domain: "operational",
        proposal_mode: "none",
        apply_policy: "human_approved_operational_api",
        default_risk_level: "low",
        requires_human_approval: false,
        legacy_agent_keys: [],
        read_classes: ["resolver_entity", "workspace_metadata"],
        write_class: "operational_api",
        org_policy_features: [],
        propose_permission_keys: [],
        apply_permission_keys: [],
        apply_route_family: "/api/admin/operational-questions",
        source_modules: [
            "web/lib/operationalQuestions/",
            "web/app/api/admin/operational-questions/",
        ],
    },
] as const;

const REGISTRY_BY_KEY: ReadonlyMap<BosCapabilityKey, BosCapabilityDefinition> = new Map(
    BOS_CAPABILITY_REGISTRY.map((def) => [def.capability_key, def])
);

/** All shipped capability keys from the Phase 1 audit. */
export const BOS_AUDITED_CAPABILITY_KEYS: readonly BosCapabilityKey[] = BOS_CAPABILITY_REGISTRY.map(
    (d) => d.capability_key
);

export function getBosCapabilityDefinition(key: BosCapabilityKey): BosCapabilityDefinition {
    const def = REGISTRY_BY_KEY.get(key);
    if (!def) {
        throw new Error(`bos: unknown capability_key ${key}`);
    }
    return def;
}

export function tryGetBosCapabilityDefinition(key: string): BosCapabilityDefinition | null {
    return REGISTRY_BY_KEY.get(key as BosCapabilityKey) ?? null;
}

export function getBosCapabilityByLegacyAgentKey(agentKey: string): BosCapabilityDefinition | null {
    for (const def of BOS_CAPABILITY_REGISTRY) {
        if (def.legacy_agent_keys.includes(agentKey)) {
            return def;
        }
    }
    return null;
}
