import type { OperationalWorkCategory, OperationalWorkDedupePolicy, OperationalWorkShape } from "@/lib/admin/operationalWork/operationalWorkTypes";

/** Platform-owned catalog keys — not tenant-extensible in Phase B. */
export type PlatformWorkDefinitionKey =
    | "manual_ad_hoc"
    | "contact_family"
    | "follow_up_after_tour"
    | "collect_missing_information"
    | "record_tour_outcome"
    | "resolve_outstanding_balance";

export type WorkDefinitionDuePolicy =
    | { kind: "offset_from_create"; days?: number; hours?: number }
    | { kind: "none" };

export type WorkDefinitionAssigneePolicy =
    | { kind: "record_owner" }
    | { kind: "creator" }
    | { kind: "unassigned" }
    | { kind: "role"; role_key: string };

export type WorkDefinitionAllowedSubject = { entity_type: "opportunities" } | { entity_type: null };

/** Platform catalog entry — authoritative defaults. */
export type PlatformWorkDefinition = {
    key: PlatformWorkDefinitionKey;
    display_name: string;
    description: string;
    outcome_intent: string;
    default_shape: OperationalWorkShape;
    category: OperationalWorkCategory;
    default_title: string;
    due_policy: WorkDefinitionDuePolicy;
    assignee_policy: WorkDefinitionAssigneePolicy;
    allowed_subjects: WorkDefinitionAllowedSubject[];
    dedupe_policy: OperationalWorkDedupePolicy;
    suggested_action_keys: string[];
    platform_enabled: boolean;
};

/** Effective definition after catalog + lifecycle metadata merge. */
export type EffectiveWorkDefinition = PlatformWorkDefinition & {
    enabled: boolean;
    metadata_overrides?: LifecycleWorkDefinitionEntryOverrides;
};

export type LifecycleWorkDefinitionEntryOverrides = {
    display_name?: string;
    default_title?: string;
    due_policy?: WorkDefinitionDuePolicy;
    assignee_policy?: WorkDefinitionAssigneePolicy;
};

export type LifecycleWorkDefinitionEntryConfig = {
    enabled: boolean;
    display_name_override?: string;
    default_title_override?: string;
    due_policy_override?: WorkDefinitionDuePolicy;
    assignee_policy_override?: WorkDefinitionAssigneePolicy;
};

export type LifecycleWorkDefinitionStageBinding = {
    available_definition_keys: PlatformWorkDefinitionKey[];
};

export type LifecycleWorkDefinitionsV1 = {
    version: 1;
    definitions: Partial<Record<PlatformWorkDefinitionKey, LifecycleWorkDefinitionEntryConfig>>;
    stage_bindings: Record<string, LifecycleWorkDefinitionStageBinding>;
};

export type ResolveWorkDefinitionsParams = {
    departmentMetadata?: Record<string, unknown> | null;
    /** Builder stage key — when set, filters by stage_bindings when configured. */
    stageKey?: string | null;
    /** Include disabled definitions in result. Default false. */
    includeDisabled?: boolean;
};
