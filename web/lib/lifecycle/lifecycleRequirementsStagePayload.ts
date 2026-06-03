import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    platformLifecycleProgressionRequirementsForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    departmentHasStageOverride,
    effectiveFieldRulesForStage,
    effectiveLifecycleProgressionRequirementsForStage,
    parseLifecycleProgressionRequirementsOverride,
    type LifecycleProgressionRequirementsOverrideV1,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    departmentHasBuilderStageFieldOverride,
    effectiveFieldRulesForBuilderStage,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { mergeLifecycleFieldPaletteForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStagePalette";
import { platformFieldRulesForStage } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";

export function buildLifecycleRequirementsStageEntry(
    builderStageKey: string,
    metadata: Record<string, unknown>,
    orgFieldDefs: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>>,
    override: LifecycleProgressionRequirementsOverrideV1 | null
) {
    const operatorStage = asOperatorStageKey(builderStageKey);
    const builderOwned = isLifecycleBuilderOwnedDepartmentMetadata(metadata);
    const palette = mergeLifecycleFieldPaletteForBuilderStage(builderStageKey, orgFieldDefs);
    const effectiveFields = effectiveFieldRulesForBuilderStage(builderStageKey, metadata, operatorStage);
    const blankRules = { required_rule_ids: [] as string[], recommended_rule_ids: [] as string[] };

    if (operatorStage) {
        const platform = platformLifecycleProgressionRequirementsForStage(operatorStage);
        const effective = effectiveLifecycleProgressionRequirementsForStage(operatorStage, metadata);
        const platformFields = platformFieldRulesForStage(operatorStage);
        const hasOverride = departmentHasStageOverride(override, operatorStage);
        const hasBuilderOverride = departmentHasBuilderStageFieldOverride(metadata, builderStageKey);
        return {
            platform: {
                required_labels: platform.required.map((r) => r.label),
                recommended_labels: platform.recommended.map((r) => r.label),
                field_rules: platformFields,
            },
            effective: {
                required_labels:
                    builderOwned && !hasOverride ? [] : effective.required.map((r) => r.label),
                recommended_labels:
                    builderOwned && !hasOverride ? [] : effective.recommended.map((r) => r.label),
                source: builderOwned && !hasOverride && !hasBuilderOverride ? "none" : effective.source,
                field_rules:
                    builderOwned && !hasOverride && !hasBuilderOverride
                        ? blankRules
                        : effectiveFields.rules,
                field_rules_source:
                    builderOwned && !hasOverride && !hasBuilderOverride
                        ? "none"
                        : effectiveFields.source,
            },
            has_department_override: hasOverride || hasBuilderOverride,
            field_palette: palette.map((f) => ({
                rule_id: f.rule_id,
                entity: f.entity,
                field_label: f.field_label,
                field_source: f.field_source,
                runtime_enforced: f.runtime_enforced,
                form_coverage_supported: f.form_coverage_supported,
                config_only: f.config_only,
            })),
        };
    }

    const hasBuilderOverride = departmentHasBuilderStageFieldOverride(metadata, builderStageKey);
    return {
        platform: {
            required_labels: [] as string[],
            recommended_labels: [] as string[],
            field_rules: blankRules,
        },
        effective: {
            required_labels: [] as string[],
            recommended_labels: [] as string[],
            source: hasBuilderOverride ? "builder_stage" : "none",
            field_rules: effectiveFields.rules,
            field_rules_source: effectiveFields.source,
        },
        has_department_override: hasBuilderOverride,
        field_palette: palette.map((f) => ({
            rule_id: f.rule_id,
            entity: f.entity,
            field_label: f.field_label,
            field_source: f.field_source,
            runtime_enforced: f.runtime_enforced,
            form_coverage_supported: f.form_coverage_supported,
            config_only: f.config_only,
        })),
    };
}
