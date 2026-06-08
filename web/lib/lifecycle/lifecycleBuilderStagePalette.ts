/**
 * Builder stage key → field palette / status sync helpers.
 * Palette aliases do not change persisted stage keys (enrolling ≠ enrollment).
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    LIFECYCLE_FIELD_REQUIREMENT_CATALOG,
    type LifecycleFieldRequirementDefinition,
    type LifecycleRequirementEntityKey,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { isDeprecatedLifecycleFieldRule } from "@/lib/lifecycle/lifecycleConfiguration";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
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
    const byRuleId = new Map<string, LifecycleFieldPaletteEntry>(
        catalog.map((entry) => [
            entry.rule_id,
            {
                rule_id: entry.rule_id,
                entity: entry.entity,
                field_label: entry.field_label,
                field_key: null,
                field_source: "catalog" as const,
                runtime_enforced: entry.runtime_enforced,
                form_coverage_supported: false,
                config_only: !entry.runtime_enforced,
            },
        ])
    );
    const org = orgByEntity ?? {};
    for (const [entityKey, rows] of Object.entries(org) as Array<
        [LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]]
    >) {
        for (const row of rows) {
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
