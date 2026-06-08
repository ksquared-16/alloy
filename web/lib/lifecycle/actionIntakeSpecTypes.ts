import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

export type ActionIntakeMode = "structured" | "hybrid";

export type ActionIntakeFieldTier = "required" | "recommended" | "optional";

export type ActionIntakeValueKind = "text" | "email" | "phone" | "date" | "select";

/** Record-backed cascade selects for inquiry_child placement fields. */
export type ActionIntakePlacementSelect = "site" | "site_program" | "site_room";

export type ActionIntakeValidationRule =
    | { kind: "non_empty" }
    | { kind: "email" }
    | { kind: "phone" }
    | { kind: "date_iso" };

export type ActionIntakeFieldSpec = {
    rule_id: string;
    entity: LifecycleRequirementEntityKey;
    entity_label: string;
    field_label: string;
    tier: ActionIntakeFieldTier;
    field_key: string | null;
    value_kind: ActionIntakeValueKind;
    /** When set, intake UI loads options from this org option set. */
    option_set_key?: string | null;
    /** Site/program/room cascade — options resolved from location hierarchy, not org-wide sets. */
    placement_select?: ActionIntakePlacementSelect | null;
    /** Key on create_lead execute payload (person + optional child_*). */
    payload_key: string;
    form_capture_keys: readonly string[];
    validation: ActionIntakeValidationRule[];
    runtime_enforced: boolean;
};

export type ActionIntakeEntityGroup = {
    entity: LifecycleRequirementEntityKey;
    entity_label: string;
    fields: ActionIntakeFieldSpec[];
};

export type ActionIntakeConstraint =
    | {
          kind: "at_least_one";
          rule_ids: readonly string[];
          message: string;
      };

export type ActionIntakeSpec = {
    action_key: "create_lead";
    department_id: string;
    process_id: string | null;
    operator_stage: LifecycleOperatorStage;
    mode: ActionIntakeMode;
    requirements_source: "platform" | "department";
    groups: ActionIntakeEntityGroup[];
    required: ActionIntakeFieldSpec[];
    recommended: ActionIntakeFieldSpec[];
    optional: ActionIntakeFieldSpec[];
    constraints: ActionIntakeConstraint[];
    copy: {
        title: string;
        help: string;
    };
};

export type ActionIntakeValidationIssue = {
    rule_id: string;
    field_label: string;
    message: string;
};
