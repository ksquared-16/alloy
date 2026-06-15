/**
 * Builder stage key → field palette / status sync helpers.
 * Palette aliases do not change persisted stage keys (enrolling ≠ enrollment).
 */

import {
    CHILDCARE_PROGRAM_FIELD_MODEL,
    isEnrollmentOperatorFieldVisible,
    isLegacyChildProgramFieldKey,
    lifecycleRequirementEntityToFieldDefinitionEntity,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    LIFECYCLE_FIELD_REQUIREMENT_CATALOG,
    type LifecycleFieldRequirementDefinition,
    type LifecycleRequirementEntityKey,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { isDeprecatedLifecycleFieldRule } from "@/lib/lifecycle/lifecycleConfiguration";
import { customFieldRuleId, lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import {
    mergeLifecycleFieldPaletteForStage,
    type LifecycleFieldPaletteEntry,
} from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";

/** Palette-only aliases — never rewrite builder stage keys or status metadata. */
const PALETTE_OPERATOR_ALIASES: Record<string, LifecycleOperatorStage> = {
    enrolling: "enrollment",
    tours: "tour",
};

export function operatorStageForFieldPalette(builderStageKey: string): LifecycleOperatorStage | null {
    const key = builderStageKey.trim();
    const direct = asOperatorStageKey(key);
    if (direct) return direct;
    return PALETTE_OPERATOR_ALIASES[key] ?? null;
}

function customBuilderStagePalette(): LifecycleFieldRequirementDefinition[] {
    return LIFECYCLE_FIELD_REQUIREMENT_CATALOG.filter((f) => {
        if (isDeprecatedLifecycleFieldRule(f.rule_id)) return false;
        if (f.stages?.length) return false;
        return true;
    });
}

export function mergeLifecycleFieldPaletteForBuilderStage(
    builderStageKey: string,
    orgByEntity?: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>> | null
) {
    const operator = operatorStageForFieldPalette(builderStageKey);
    if (operator) {
        return mergeLifecycleFieldPaletteForStage(operator, orgByEntity);
    }
    const catalog = customBuilderStagePalette();
    const byRuleId = new Map<string, LifecycleFieldPaletteEntry>();
    for (const entry of catalog) {
        const binding = lifecycleFieldRuleBinding(entry.rule_id);
        const fieldKey = binding?.field_key ?? null;
        const entityType = lifecycleRequirementEntityToFieldDefinitionEntity(entry.entity);
        if (
            fieldKey &&
            !isEnrollmentOperatorFieldVisible(entityType, fieldKey, { is_system: true })
        ) {
            continue;
        }
        byRuleId.set(entry.rule_id, {
            rule_id: entry.rule_id,
            entity: entry.entity,
            field_label: entry.field_label,
            field_key: fieldKey,
            field_source: "catalog" as const,
            runtime_enforced: entry.runtime_enforced,
            form_coverage_supported: false,
            config_only: !entry.runtime_enforced,
        });
    }
    const org = orgByEntity ?? {};
    for (const [entityKey, rows] of Object.entries(org) as Array<
        [LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]]
    >) {
        const catalogKeys = new Set(
            [...byRuleId.values()]
                .filter((e) => e.entity === entityKey && e.field_key)
                .map((e) => e.field_key as string)
        );
        for (const row of rows) {
            if (catalogKeys.has(row.field_key)) continue;
            const entityType =
                row.entity_type?.trim() || lifecycleRequirementEntityToFieldDefinitionEntity(entityKey);
            if (
                !isEnrollmentOperatorFieldVisible(entityType, row.field_key, {
                    is_system: row.is_system,
                    config: row.config ?? null,
                })
            ) {
                continue;
            }
            if (isLegacyChildProgramFieldKey(row.field_key)) continue;
            if (
                row.field_key === CHILDCARE_PROGRAM_FIELD_MODEL.legacy_alias_field_key &&
                catalogKeys.has(CHILDCARE_PROGRAM_FIELD_MODEL.canonical_field_key)
            ) {
                continue;
            }
            const rule_id = customFieldRuleId(entityKey, row.field_key);
            if (!byRuleId.has(rule_id)) {
                byRuleId.set(rule_id, {
                    rule_id,
                    entity: entityKey,
                    field_label: row.label,
                    field_key: row.field_key,
                    field_source: row.is_system ? "system" : "custom",
                    runtime_enforced: false,
                    form_coverage_supported: true,
                    config_only: true,
                });
                catalogKeys.add(row.field_key);
            }
        }
    }
    return [...byRuleId.values()].sort((a, b) => {
        if (a.entity !== b.entity) return a.entity.localeCompare(b.entity);
        return a.field_label.localeCompare(b.field_label);
    });
}

export const WAITLIST_REQUIRED_INFO_HELPER =
    "Waitlist usually depends on child, program, desired start date, site/location, and priority criteria. Select the fields your team needs before a record can enter this stage." as const;

export function isWaitlistBuilderStage(stageKey: string): boolean {
    const k = stageKey.trim().toLowerCase();
    return k === "waitlist" || k.includes("waitlist");
}
