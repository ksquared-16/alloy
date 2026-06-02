import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleRequirementsSource } from "@/lib/completion/lifecycleProgressionRequirementsConfig";

/** Forms-friendly entity grouping for coverage UI (Card 3+). */
export type FormsLifecycleEntityType =
    | "person"
    | "child"
    | "opportunity"
    | "customer"
    | "household"
    | "unknown";

export type FormsLifecycleRequirementSource =
    | "lifecycle_stage"
    | "action_intake"
    | "status_transition"
    | "manual";

export type FormsLifecycleFieldRequirement = {
    /** Internal lifecycle rule id (e.g. person:first_name). */
    id: string;
    entityType: FormsLifecycleEntityType;
    fieldKey: string;
    label: string;
    requiredness: "required" | "recommended";
    requirementSource: FormsLifecycleRequirementSource;
};

export type FormsLifecycleRequirementConstraint = {
    kind: "at_least_one";
    ruleIds: readonly string[];
    message: string;
};

export type FormsLifecycleRequirementContract = {
    lifecycleLabel?: string;
    stageKey: LifecycleOperatorStage;
    stageLabel?: string;
    intent: string;
    departmentId?: string;
    processId?: string | null;
    requirementsSource: LifecycleRequirementsSource;
    required: FormsLifecycleFieldRequirement[];
    recommended: FormsLifecycleFieldRequirement[];
    constraints: FormsLifecycleRequirementConstraint[];
};

export type FormsLifecycleCoverageItemStatus = "satisfied" | "missing" | "unknown";

export type FormsLifecycleCoverageMatchKind =
    | "crm_mapping_key"
    | "entity_field_key"
    | "registry"
    | "alias"
    | "label_weak";

export type FormsLifecycleCoverageItem = {
    requirementId: string;
    requirementLabel: string;
    requirementEntityType: FormsLifecycleEntityType;
    requirementFieldKey: string;
    requiredness: "required" | "recommended";
    status: FormsLifecycleCoverageItemStatus;
    matchedFormFieldId?: string;
    matchedFormFieldLabel?: string;
    matchKind?: FormsLifecycleCoverageMatchKind;
};

export type FormsLifecycleCoverageEntityGroup = {
    entityLabel: string;
    required: FormsLifecycleCoverageItem[];
    recommended: FormsLifecycleCoverageItem[];
};

export type FormsLifecycleCoverageResult = {
    ready: boolean;
    missingRequired: FormsLifecycleCoverageItem[];
    missingRecommended: FormsLifecycleCoverageItem[];
    satisfiedRequired: FormsLifecycleCoverageItem[];
    satisfiedRecommended: FormsLifecycleCoverageItem[];
    byEntity: Record<string, FormsLifecycleCoverageEntityGroup>;
    /** Constraint failures surfaced as required gaps (e.g. email or phone). */
    constraintFailures: FormsLifecycleCoverageItem[];
};

export const FORMS_LIFECYCLE_ENTITY_GROUP_LABELS: Record<FormsLifecycleEntityType, string> = {
    person: "Person / Guardian",
    child: "Child",
    opportunity: "Opportunity / Lead",
    customer: "Customer / Household",
    household: "Customer / Household",
    unknown: "Other",
};
