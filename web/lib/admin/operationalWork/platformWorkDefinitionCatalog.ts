import { MANUAL_AD_HOC_WORK_DEFINITION_KEY } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import type {
    PlatformWorkDefinition,
    PlatformWorkDefinitionKey,
    LifecycleWorkDefinitionStageBinding,
} from "@/lib/admin/operationalWork/workDefinitionTypes";

const PLATFORM_WORK_DEFINITIONS: PlatformWorkDefinition[] = [
    {
        key: "manual_ad_hoc",
        display_name: "Ad hoc",
        description: "Freeform follow-up or reminder without a predefined template.",
        outcome_intent: "Operator-defined obligation completed or dismissed.",
        default_shape: "task",
        category: "other",
        default_title: "",
        due_policy: { kind: "offset_from_create", days: 1 },
        assignee_policy: { kind: "creator" },
        allowed_subjects: [{ entity_type: "opportunities" }, { entity_type: null }],
        dedupe_policy: "none",
        suggested_action_keys: [],
        platform_enabled: true,
    },
    {
        key: "contact_family",
        display_name: "Contact family",
        description: "Reach out to the family for a check-in or next step.",
        outcome_intent: "Meaningful contact completed or documented exception.",
        default_shape: "task",
        category: "follow_up",
        default_title: "Contact family",
        due_policy: { kind: "offset_from_create", days: 1 },
        assignee_policy: { kind: "record_owner" },
        allowed_subjects: [{ entity_type: "opportunities" }],
        dedupe_policy: "definition_subject",
        suggested_action_keys: ["create_task"],
        platform_enabled: true,
    },
    {
        key: "follow_up_after_tour",
        display_name: "Follow up after tour",
        description: "Post-tour outreach while interest is fresh.",
        outcome_intent: "Family contacted after tour or exception documented.",
        default_shape: "task",
        category: "follow_up",
        default_title: "Follow up after tour",
        due_policy: { kind: "offset_from_create", days: 2 },
        assignee_policy: { kind: "record_owner" },
        allowed_subjects: [{ entity_type: "opportunities" }],
        dedupe_policy: "definition_subject",
        suggested_action_keys: ["create_task"],
        platform_enabled: true,
    },
    {
        key: "collect_missing_information",
        display_name: "Collect missing information",
        description: "Gather required enrollment information from the family.",
        outcome_intent: "Required information collected or exception documented.",
        default_shape: "task",
        category: "information_collection",
        default_title: "Collect missing information",
        due_policy: { kind: "offset_from_create", days: 3 },
        assignee_policy: { kind: "record_owner" },
        allowed_subjects: [{ entity_type: "opportunities" }],
        dedupe_policy: "definition_subject",
        suggested_action_keys: [],
        platform_enabled: true,
    },
    {
        key: "record_tour_outcome",
        display_name: "Record tour outcome",
        description: "Capture what happened at the tour and next steps.",
        outcome_intent: "Tour outcome recorded in the system.",
        default_shape: "task",
        category: "coordination",
        default_title: "Record tour outcome",
        due_policy: { kind: "offset_from_create", days: 1 },
        assignee_policy: { kind: "record_owner" },
        allowed_subjects: [{ entity_type: "opportunities" }],
        dedupe_policy: "definition_subject",
        suggested_action_keys: ["record_tour_outcome"],
        platform_enabled: true,
    },
    {
        key: "resolve_outstanding_balance",
        display_name: "Resolve outstanding balance",
        description: "Follow up on overdue balance or payment plan.",
        outcome_intent: "Balance cleared, plan in place, or exception documented.",
        default_shape: "task",
        category: "resolution",
        default_title: "Resolve outstanding balance",
        due_policy: { kind: "offset_from_create", days: 5 },
        assignee_policy: { kind: "record_owner" },
        allowed_subjects: [{ entity_type: "opportunities" }],
        dedupe_policy: "definition_subject_period",
        suggested_action_keys: [],
        platform_enabled: false,
    },
];

const CATALOG_BY_KEY = new Map<PlatformWorkDefinitionKey, PlatformWorkDefinition>(
    PLATFORM_WORK_DEFINITIONS.map((def) => [def.key, def]),
);

/** Enrollment-oriented default stage bindings — used when metadata has no stage_bindings. */
export const PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS: Record<string, LifecycleWorkDefinitionStageBinding> = {
    intake: {
        available_definition_keys: ["manual_ad_hoc", "contact_family", "collect_missing_information"],
    },
    qualification: {
        available_definition_keys: ["manual_ad_hoc", "contact_family", "collect_missing_information"],
    },
    tour: {
        available_definition_keys: [
            "manual_ad_hoc",
            "record_tour_outcome",
            "follow_up_after_tour",
            "contact_family",
        ],
    },
    decision: {
        available_definition_keys: ["manual_ad_hoc", "contact_family", "collect_missing_information"],
    },
    enrollment: {
        available_definition_keys: ["manual_ad_hoc", "contact_family", "collect_missing_information"],
    },
};

export function listPlatformWorkDefinitions(): readonly PlatformWorkDefinition[] {
    return PLATFORM_WORK_DEFINITIONS;
}

export function getPlatformWorkDefinition(key: string): PlatformWorkDefinition | null {
    const trimmed = key.trim() as PlatformWorkDefinitionKey;
    return CATALOG_BY_KEY.get(trimmed) ?? null;
}

export function isKnownWorkDefinitionKey(key: string): key is PlatformWorkDefinitionKey {
    return CATALOG_BY_KEY.has(key.trim() as PlatformWorkDefinitionKey);
}

export function listPlatformWorkDefinitionKeys(): PlatformWorkDefinitionKey[] {
    return PLATFORM_WORK_DEFINITIONS.map((def) => def.key);
}

/** Alias aligned with Phase A manual ad hoc key. */
export const PLATFORM_MANUAL_AD_HOC_KEY = MANUAL_AD_HOC_WORK_DEFINITION_KEY as PlatformWorkDefinitionKey;
