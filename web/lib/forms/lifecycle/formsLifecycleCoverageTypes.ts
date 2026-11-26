import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleRequirementsSource } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { RequirementTiming } from "@/lib/lifecycle/requirementTimingTypes";

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
    /**
     * Effective requiredness *for this form* — `required` means the form must capture it before it
     * can create records. A process-required rule owned by a later moment lands here as
     * `recommended` with `deferredTiming` set; see `formRequirementTiming.ts`.
     */
    requiredness: "required" | "recommended";
    requirementSource: FormsLifecycleRequirementSource;
    /**
     * Set when the process configures this rule as required but a later moment owns it, so the form
     * is not blocked. Carries the configured timing(s) so the UI can say which moment owns it
     * instead of silently presenting it as merely "recommended".
     */
    deferredTiming?: readonly RequirementTiming[];
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
    /** Level-aware readiness (Phase 1 — internal only, no UI). */
    readiness?: ReadinessResult;
};

export const FORMS_LIFECYCLE_ENTITY_GROUP_LABELS: Record<FormsLifecycleEntityType, string> = {
    person: "Person / Guardian",
    child: "Child",
    opportunity: "Opportunity / Lead",
    customer: "Customer / Household",
    household: "Customer / Household",
    unknown: "Other",
};
