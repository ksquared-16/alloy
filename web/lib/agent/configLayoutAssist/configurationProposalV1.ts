/**
 * Configuration / Layout Assist V1 — Card 5: canonical proposal contract (types only).
 * No persistence, apply, routing, or AI generation.
 */

import { FIELD_DEFINITION_ENTITY_TYPES } from "@/lib/fields/inquiryChildFieldRegistry";

export const CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY = "config_layout_assist" as const;

export const CONFIGURATION_PROPOSAL_VERSION = 1 as const;

export type ConfigurationProposalVersion = typeof CONFIGURATION_PROPOSAL_VERSION;

/** Supported admin field definition entity types (mirrors field-definitions API). */
export const CONFIGURATION_PROPOSAL_ENTITY_TYPES = FIELD_DEFINITION_ENTITY_TYPES;

export type ConfigurationProposalEntityType = (typeof CONFIGURATION_PROPOSAL_ENTITY_TYPES)[number];

export type ConfigurationProposalCategoryV1 =
    | "layout"
    | "field"
    | "section"
    | "requirement"
    | "interaction"
    | "data_quality"
    | "option_set";

export type ConfigurationProposalRiskLevelV1 = "low" | "medium" | "high";

export type ProposalWarningSeverityV1 = "warning" | "error";

export type ProposalWarningV1 = {
    severity: ProposalWarningSeverityV1;
    code: string;
    message: string;
    operation_id?: string | null;
};

export type ConfigurationProposalApplyModeV1 =
    | "single_operation"
    | "batched_atomic"
    | "recommendation_only";

export type ConfigurationOperationKindV1 =
    | "create_field"
    | "update_field"
    | "set_field_requirement"
    | "set_field_interaction"
    | "set_field_write_target"
    | "create_section"
    | "update_section"
    | "reorder_section"
    | "archive_section"
    | "expose_field_on_layout"
    | "hide_field_on_layout"
    | "move_field_to_section"
    | "update_option_set"
    | "data_quality_recommendation";

/** Mutating operations (excludes recommendation-only). */
export const CONFIGURATION_MUTATING_OPERATION_KINDS: readonly ConfigurationOperationKindV1[] = [
    "create_field",
    "update_field",
    "set_field_requirement",
    "set_field_interaction",
    "set_field_write_target",
    "create_section",
    "update_section",
    "reorder_section",
    "archive_section",
    "expose_field_on_layout",
    "hide_field_on_layout",
    "move_field_to_section",
    "update_option_set",
] as const;

export const CONFIGURATION_OPERATION_KINDS: readonly ConfigurationOperationKindV1[] = [
    ...CONFIGURATION_MUTATING_OPERATION_KINDS,
    "data_quality_recommendation",
] as const;

/** Permission keys referenced by proposals (Card 7 will seed; validate known set). */
export const CONFIGURATION_PROPOSAL_PERMISSION_KEYS = [
    "config_assist.generate",
    "config_assist.review",
    "config_assist.apply",
    "fields.manage",
    "fields.requirements.manage",
    "fields.editability.manage",
    "sections.manage",
    "layouts.manage",
    "option_sets.manage",
    "data_quality.view",
] as const;

export type ConfigurationProposalPermissionKey = (typeof CONFIGURATION_PROPOSAL_PERMISSION_KEYS)[number];

export type ConfigurationOperationBaseV1 = {
    operation_id: string;
    kind: ConfigurationOperationKindV1;
    entity_type: string;
    layout_key?: string | null;
    field_key?: string | null;
    section_key?: string | null;
    /** Snapshot before change (null when creating). */
    before: Record<string, unknown> | null;
    /** Intended state after apply (null for recommendation-only). */
    after: Record<string, unknown> | null;
    rationale: string[];
    warnings?: ProposalWarningV1[];
    required_permissions: string[];
    /** Optimistic concurrency hints for apply adapters (Card 10). */
    expected_updated_at?: string | null;
    expected_config_version?: number | null;
    field_definition_id?: string | null;
    surface?: string | null;
};

export type ConfigurationOperationV1 = ConfigurationOperationBaseV1;

export type ConfigurationProposalV1 = {
    version: typeof CONFIGURATION_PROPOSAL_VERSION;
    id: string;
    category: ConfigurationProposalCategoryV1;
    intent: string;
    summary: string;
    rationale: string[];
    impacted_entities: string[];
    impacted_layouts?: string[];
    impacted_fields?: string[];
    warnings?: ProposalWarningV1[];
    risk_level: ConfigurationProposalRiskLevelV1;
    requires_approval: boolean;
    permission_requirements: string[];
    proposed_operations: ConfigurationOperationV1[];
    apply_mode: ConfigurationProposalApplyModeV1;
    metadata?: Record<string, unknown>;
    generated_by: string;
    created_at: string;
    created_by?: string | null;
};

export type ProposalValidationIssue = {
    severity: ProposalWarningSeverityV1;
    code: string;
    message: string;
    operation_id?: string | null;
    path?: string | null;
};

export type ProposalValidationResultV1 = {
    ok: boolean;
    issues: ProposalValidationIssue[];
    error_count: number;
    warning_count: number;
};

export type NormalizeConfigurationProposalOptionsV1 = {
    /** Recompute risk from operations when true (default true). */
    recompute_risk?: boolean;
    /** Merge operation permissions into permission_requirements (default true). */
    merge_permissions?: boolean;
    /** Default generated_by when missing. */
    default_generated_by?: string;
};
