/**
 * Per-builder-stage-key field rules (departments.metadata.lifecycle_builder_stage_field_rules_v1).
 * Distinct from operator-stage keys in lifecycle_progression_requirements_v1.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { sanitizeLifecycleFieldRuleIds } from "@/lib/lifecycle/lifecycleConfiguration";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    effectiveFieldRulesForStage,
    departmentHasStageOverride,
    parseLifecycleProgressionRequirementsOverride,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { effectiveFieldRulesStoredForStage } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    buildDualWriteStoredFieldRules,
    enforceableLookupFromPalette,
    isLifecycleRuleEnforceable,
    parseStoredFieldRules,
    storedFieldRulesToMetadataFieldRules,
    type LifecycleStageFieldRulesStored,
    type RuleLevelsV1,
    type RuleMetaV1,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

export const LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY =
    "lifecycle_builder_stage_field_rules_v1" as const;

export type LifecycleBuilderStageFieldRulesV1 = {
    version: 1;
    by_stage_key: Record<
        string,
        {
            required_rule_ids?: string[];
            recommended_rule_ids?: string[];
            rule_levels_v1?: RuleLevelsV1;
            rule_meta_v1?: RuleMetaV1;
        }
    >;
};

export function parseLifecycleBuilderStageFieldRules(
    metadata: Record<string, unknown> | null | undefined
): LifecycleBuilderStageFieldRulesV1 | null {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata[LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY];
    if (!root || typeof root !== "object" || Array.isArray(root)) return null;
    if ((root as { version?: unknown }).version !== 1) return null;
    const raw = (root as { by_stage_key?: unknown }).by_stage_key;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const by_stage_key: LifecycleBuilderStageFieldRulesV1["by_stage_key"] = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const stageKey = key.trim();
        if (!stageKey || !value || typeof value !== "object" || Array.isArray(value)) continue;
        const stored = parseStoredFieldRules(value);
        if (!stored) continue;
        by_stage_key[stageKey] = storedFieldRulesToMetadataFieldRules(stored) as LifecycleBuilderStageFieldRulesV1["by_stage_key"][string];
    }
    if (!Object.keys(by_stage_key).length) return null;
    return { version: 1, by_stage_key };
}

function sanitizeRules(rules: LifecycleStageFieldRules): LifecycleStageFieldRules {
    const required_rule_ids = sanitizeLifecycleFieldRuleIds(rules.required_rule_ids);
    const requiredSet = new Set(required_rule_ids);
    return {
        required_rule_ids,
        recommended_rule_ids: sanitizeLifecycleFieldRuleIds(rules.recommended_rule_ids).filter(
            (id) => !requiredSet.has(id)
        ),
    };
}

export function departmentHasBuilderStageFieldOverride(
    metadata: Record<string, unknown> | null | undefined,
    builderStageKey: string
): boolean {
    const parsed = parseLifecycleBuilderStageFieldRules(metadata);
    return parsed?.by_stage_key[builderStageKey.trim()] !== undefined;
}

/**
 * Effective field rules for a builder stage key.
 *
 * Operator stages (lead/tour/…) prefer `lifecycle_progression_requirements_v1` when a
 * department override exists — Save Stage writes that store. A leftover
 * `lifecycle_builder_stage_field_rules_v1` row must not shadow Off / timing changes.
 */
export function effectiveFieldRulesForBuilderStage(
    builderStageKey: string,
    departmentMetadata: Record<string, unknown> | null | undefined,
    operatorStage: LifecycleOperatorStage | null
): { rules: LifecycleStageFieldRules; source: "none" | "platform" | "department" | "builder_stage" } {
    const key = builderStageKey.trim();
    if (operatorStage) {
        const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
        const hasOverride = departmentHasStageOverride(override, operatorStage);
        if (hasOverride) {
            const effective = effectiveFieldRulesForStage(operatorStage, departmentMetadata ?? null);
            return {
                rules: effective.rules,
                source: "department",
            };
        }
    }
    const builderParsed = parseLifecycleBuilderStageFieldRules(departmentMetadata ?? null);
    const builderRow = builderParsed?.by_stage_key[key];
    if (builderRow) {
        return {
            rules: sanitizeRules({
                required_rule_ids: builderRow.required_rule_ids ?? [],
                recommended_rule_ids: builderRow.recommended_rule_ids ?? [],
            }),
            source: "builder_stage",
        };
    }
    if (operatorStage) {
        const effective = effectiveFieldRulesForStage(operatorStage, departmentMetadata ?? null);
        return {
            rules: effective.rules,
            source: effective.source === "platform" ? "platform" : "department",
        };
    }
    return {
        rules: { required_rule_ids: [], recommended_rule_ids: [] },
        source: "none",
    };
}

/** Effective stored field rules including rule_levels_v1 / rule_meta_v1 when persisted. */
export function effectiveFieldRulesStoredForBuilderStage(
    builderStageKey: string,
    departmentMetadata: Record<string, unknown> | null | undefined,
    operatorStage: LifecycleOperatorStage | null
): LifecycleStageFieldRulesStored {
    const key = builderStageKey.trim();
    if (operatorStage) {
        const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
        if (departmentHasStageOverride(override, operatorStage)) {
            return effectiveFieldRulesStoredForStage(operatorStage, departmentMetadata);
        }
    }
    const builderParsed = parseLifecycleBuilderStageFieldRules(departmentMetadata ?? null);
    const builderRow = builderParsed?.by_stage_key[key];
    if (builderRow) {
        const stored = parseStoredFieldRules(builderRow);
        if (stored) return stored;
    }
    if (operatorStage) {
        return effectiveFieldRulesStoredForStage(operatorStage, departmentMetadata);
    }
    const { rules } = effectiveFieldRulesForBuilderStage(key, departmentMetadata, operatorStage);
    return {
        required_rule_ids: rules.required_rule_ids,
        recommended_rule_ids: rules.recommended_rule_ids,
    };
}

export function buildBuilderStageFieldRulesPatch(input: {
    builderStageKey: string;
    required_rule_ids: string[];
    recommended_rule_ids: string[];
    existingMetadata: Record<string, unknown> | null;
    explicit_rule_levels_v1?: RuleLevelsV1 | null;
    explicit_rule_meta_v1?: RuleMetaV1 | null;
    mergedPalette?: readonly LifecycleFieldPaletteEntry[];
}): Record<string, unknown> {
    const stageKey = input.builderStageKey.trim();
    if (!stageKey) throw new Error("builderStageKey is required");

    const sanitizedRequired = sanitizeRules({
        required_rule_ids: input.required_rule_ids,
        recommended_rule_ids: [],
    }).required_rule_ids;
    const sanitizedRecommended = sanitizeRules({
        required_rule_ids: [],
        recommended_rule_ids: input.recommended_rule_ids,
    }).recommended_rule_ids;

    const isEnforceable = input.mergedPalette
        ? enforceableLookupFromPalette(input.mergedPalette)
        : (ruleId: string) => isLifecycleRuleEnforceable(ruleId);

    const dualWrite = buildDualWriteStoredFieldRules({
        required_rule_ids: sanitizedRequired,
        recommended_rule_ids: sanitizedRecommended,
        explicit_rule_levels_v1: input.explicit_rule_levels_v1,
        explicit_rule_meta_v1: input.explicit_rule_meta_v1,
        isEnforceable,
    });

    const prev = parseLifecycleBuilderStageFieldRules(input.existingMetadata) ?? {
        version: 1 as const,
        by_stage_key: {},
    };
    const by_stage_key = {
        ...prev.by_stage_key,
        [stageKey]: storedFieldRulesToMetadataFieldRules(dualWrite),
    };

    return {
        [LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY]: {
            version: 1,
            by_stage_key,
        },
    };
}

export function buildBuilderStageFieldRulesResetPatch(input: {
    builderStageKey: string;
    existingMetadata: Record<string, unknown> | null;
}): Record<string, unknown> | null {
    const stageKey = input.builderStageKey.trim();
    const prev = parseLifecycleBuilderStageFieldRules(input.existingMetadata);
    if (!prev?.by_stage_key[stageKey]) return null;
    const by_stage_key = { ...prev.by_stage_key };
    delete by_stage_key[stageKey];
    if (!Object.keys(by_stage_key).length) {
        return { [LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY]: null };
    }
    return {
        [LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY]: {
            version: 1,
            by_stage_key,
        },
    };
}
