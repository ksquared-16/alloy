import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { EnrollmentProcessFormCoverageRow } from "@/lib/lifecycle/enrollmentProcessFormCoverage";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type {
    LifecycleRequirementEntityKey,
    LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { LifecycleBaseActionDefinition } from "@/lib/lifecycle/lifecycleStageBaseActions";
import type { QueueMembershipStatusOption } from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type LifecycleStageBootstrapFieldPaletteEntry = {
    rule_id: string;
    entity: string;
    field_label: string;
    field_source?: string;
    runtime_enforced: boolean;
    form_coverage_supported?: boolean;
    config_only?: boolean;
};

export type LifecycleStageBootstrapFieldRequirements = {
    platform?: {
        field_rules: LifecycleStageFieldRules;
        required_labels?: string[];
        recommended_labels?: string[];
    };
    effective: {
        field_rules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored;
        field_rules_source: string;
        required_labels: string[];
        recommended_labels: string[];
        source: string;
    };
    has_department_override: boolean;
    field_palette: LifecycleStageBootstrapFieldPaletteEntry[];
};

export type LifecycleStageBootstrapPayload = {
    department_id: string;
    builder_stage_key: string;
    operator_stage: LifecycleOperatorStage | null;
    statuses: EnrollmentStatusStagesPayload;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    field_requirements: LifecycleStageBootstrapFieldRequirements | null;
    entity_display_labels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    actions: LifecycleConfiguredActionRow[];
    forms: EnrollmentProcessFormCoverageRow[];
    linkable_forms: { id: string; name: string }[];
    base_actions: LifecycleBaseActionDefinition[];
    queue_membership: QueueMembershipV1 | null;
    queue_membership_status_options: QueueMembershipStatusOption[];
    stage_operating_plan: StageOperatingPlanV1 | null;
};
