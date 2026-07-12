/**
 * Unified lifecycle requirement evaluation types.
 * @see docs/sprints/archive/05_2026/lifecycle_configuration_requirements_design_package_v1.md
 */

import type { CompletionEntityType } from "@/lib/completion/requirementValidationTypes";

export const EFFECTIVE_REQUIREMENT_TRIGGERS = [
    "layout_save",
    "action_execute",
    "status_transition",
    "bos_scan",
] as const;

export type EffectiveRequirementTrigger = (typeof EFFECTIVE_REQUIREMENT_TRIGGERS)[number];

export type EffectiveRequirementSeverity = "required" | "recommended" | "warning";

export type EffectiveRequirementSource = "layout" | "action" | "transition" | "completion";

export type EffectiveRequirementResolution = {
    type: "field" | "action" | "modal";
    field_key?: string;
    action_key?: string;
};

export type EffectiveRequirementViolation = {
    field_key: string;
    label: string;
    severity: EffectiveRequirementSeverity;
    reason: string;
    source: EffectiveRequirementSource;
    resolution?: EffectiveRequirementResolution;
    entity_type?: string;
    entity_id?: string;
    /** Resolved persisted requirement level when level-aware evaluation ran. */
    requirement_level?: "recommended" | "required" | "enforced";
    /** Lifecycle field rule id when evaluated from stage field rules. */
    rule_id?: string;
};

export type AutoPopulateInstruction = {
    entity_type: "opportunity" | "person" | "inquiry_child";
    entity_id?: string;
    field_key: string;
    value: string;
    /** metadata.* when set */
    metadata_key?: string;
};

export type EffectiveRequirementsSourceSummary = {
    layoutRules: number;
    actionRules: number;
    transitionRules: number;
    completionRules: number;
};

export type EffectiveRequirementsResult = {
    ok: boolean;
    blocking: EffectiveRequirementViolation[];
    recommended: EffectiveRequirementViolation[];
    autoPopulate: AutoPopulateInstruction[];
    sourceSummary: EffectiveRequirementsSourceSummary;
};

export type EffectiveRequirementsContext = {
    org_id?: string;
    entity_type: CompletionEntityType;
    entity_id: string;
    record_type?: string;
    lifecycle_stage?: string;
    status?: string | null;
    status_from?: string | null;
    status_to?: string | null;
    action_key?: string | null;
    transition_key?: string | null;
    trigger: EffectiveRequirementTrigger;
    surface?: string;
    layout_variant_key?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
    /** Merged record snapshot for evaluation */
    record: Record<string, unknown>;
    payload?: Record<string, unknown>;
};
