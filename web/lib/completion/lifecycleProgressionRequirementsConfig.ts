/**
 * Department overrides for lifecycle progression requirements (Settings + runtime merge).
 * Platform defaults live in lifecycleProgressionRequirementsCatalog; this module merges overrides.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    platformLifecycleProgressionRequirementsForStage,
    type LifecycleProgressionRequirementRow,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    deriveObjectLabelsFromFieldRules,
    platformFieldRulesForStage,
    validateFieldRuleIdsForStage,
    type LifecycleStageFieldRules,
    OBJECT_LABEL_TO_FIELD_RULES,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    validateFieldRuleIdsAgainstPalette,
    type LifecycleFieldPaletteEntry,
} from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { sanitizeLifecycleFieldRuleIds } from "@/lib/lifecycle/lifecycleConfiguration";
import {
    buildDualWriteStoredFieldRules,
    enforceableLookupFromPalette,
    isLifecycleRuleEnforceable,
    parseStoredFieldRules,
    storedFieldRulesToMetadataFieldRules,
    type LifecycleStageFieldRulesStored,
    type RuleLevelsV1,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";

export const LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY = "lifecycle_progression_requirements_v1";

export type LifecycleProgressionRequirementsOverrideV1 = {
    version: 1;
    stages: Partial<
        Record<
            LifecycleOperatorStage,
            {
                required_labels?: string[];
                recommended_labels?: string[];
                field_rules?: {
                    required_rule_ids?: string[];
                    recommended_rule_ids?: string[];
                    rule_levels_v1?: RuleLevelsV1;
                };
            }
        >
    >;
};

export type LifecycleRequirementsSource = "platform" | "department";

/** Labels operators cannot toggle yet (runtime or policy). */
export const LIFECYCLE_LOCKED_LABEL_REASONS: Partial<Record<LifecycleOperatorStage, Record<string, string>>> = {
    tour: {
        "Tour Date and Time": "Managed by the platform for now.",
    },
    enrolled: {
        "Enrollment Date": "Managed by the platform for now.",
    },
};

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (
        s === "lead" ||
        s === "qualification" ||
        s === "tour" ||
        s === "waitlist" ||
        s === "enrollment" ||
        s === "enrolled"
    );
}

function normalizeRuleIdList(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out;
}

function parseStageFieldRules(value: unknown): LifecycleStageFieldRules | null {
    const stored = parseStageFieldRulesStored(value);
    if (!stored) return null;
    return {
        required_rule_ids: stored.required_rule_ids,
        recommended_rule_ids: stored.recommended_rule_ids,
    };
}

export function parseStageFieldRulesStored(value: unknown): LifecycleStageFieldRulesStored | null {
    return parseStoredFieldRules(value);
}

function fieldRulesFromObjectLabels(requiredLabels: string[], recommendedLabels: string[]): LifecycleStageFieldRules {
    const required_rule_ids: string[] = [];
    const recommended_rule_ids: string[] = [];
    const requiredSet = new Set<string>();
    for (const label of requiredLabels) {
        for (const id of OBJECT_LABEL_TO_FIELD_RULES[label] ?? []) {
            if (!requiredSet.has(id)) {
                requiredSet.add(id);
                required_rule_ids.push(id);
            }
        }
    }
    for (const label of recommendedLabels) {
        for (const id of OBJECT_LABEL_TO_FIELD_RULES[label] ?? []) {
            if (!requiredSet.has(id) && !recommended_rule_ids.includes(id)) {
                recommended_rule_ids.push(id);
            }
        }
    }
    return { required_rule_ids, recommended_rule_ids };
}

function sanitizeStageFieldRules(rules: LifecycleStageFieldRules): LifecycleStageFieldRules {
    const required_rule_ids = sanitizeLifecycleFieldRuleIds(rules.required_rule_ids);
    const requiredSet = new Set(required_rule_ids);
    return {
        required_rule_ids,
        recommended_rule_ids: sanitizeLifecycleFieldRuleIds(rules.recommended_rule_ids).filter(
            (id) => !requiredSet.has(id)
        ),
    };
}

export function effectiveFieldRulesForStage(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null
): { rules: LifecycleStageFieldRules; source: LifecycleRequirementsSource } {
    const platform = platformFieldRulesForStage(stage);
    const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
    const stageOverride = override?.stages?.[stage];
    const fieldOverride = stageOverride?.field_rules
        ? parseStageFieldRules(stageOverride.field_rules)
        : null;

    if (!fieldOverride) {
        if (stageOverride?.required_labels || stageOverride?.recommended_labels) {
            const effective = effectiveLifecycleProgressionRequirementsForStage(stage, departmentMetadata ?? null);
            return {
                rules: sanitizeStageFieldRules(
                    fieldRulesFromObjectLabels(
                        effective.required.map((r) => r.label),
                        effective.recommended.map((r) => r.label)
                    )
                ),
                source: "department",
            };
        }
        return { rules: sanitizeStageFieldRules(platform), source: "platform" };
    }

    const requiredSet = new Set(fieldOverride.required_rule_ids);
    return {
        rules: sanitizeStageFieldRules({
            required_rule_ids: fieldOverride.required_rule_ids,
            recommended_rule_ids: fieldOverride.recommended_rule_ids.filter((id) => !requiredSet.has(id)),
        }),
        source: "department",
    };
}

/** Effective field rules with optional persisted rule_levels_v1 for level-aware evaluation. */
export function effectiveFieldRulesStoredForStage(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null
): LifecycleStageFieldRulesStored {
    const { rules } = effectiveFieldRulesForStage(stage, departmentMetadata);
    const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
    const fieldRulesRaw = override?.stages?.[stage]?.field_rules;
    const storedOverride = fieldRulesRaw ? parseStageFieldRulesStored(fieldRulesRaw) : null;
    return {
        required_rule_ids: rules.required_rule_ids,
        recommended_rule_ids: rules.recommended_rule_ids,
        ...(storedOverride?.rule_levels_v1 ? { rule_levels_v1: storedOverride.rule_levels_v1 } : {}),
    };
}

export function buildLifecycleFieldRulesOverridePatch(input: {
    stage: LifecycleOperatorStage;
    required_rule_ids: string[];
    recommended_rule_ids: string[];
    existingMetadata: Record<string, unknown> | null;
    mergedPalette?: readonly LifecycleFieldPaletteEntry[];
    explicit_rule_levels_v1?: RuleLevelsV1 | null;
}): Record<string, unknown> {
    const validate = (ids: string[]) =>
        input.mergedPalette
            ? validateFieldRuleIdsAgainstPalette(ids, input.mergedPalette)
            : validateFieldRuleIdsForStage(input.stage, ids);
    const required = validate(input.required_rule_ids);
    const recommended = validate(input.recommended_rule_ids);
    if (!required || !recommended) {
        throw new Error("Invalid field rules for this stage.");
    }
    const requiredSet = new Set(required);
    const recommendedDeduped = recommended.filter((id) => !requiredSet.has(id));
    const derived = deriveObjectLabelsFromFieldRules(required, recommendedDeduped);

    const isEnforceable = input.mergedPalette
        ? enforceableLookupFromPalette(input.mergedPalette)
        : (ruleId: string) => isLifecycleRuleEnforceable(ruleId);

    const dualWrite = buildDualWriteStoredFieldRules({
        required_rule_ids: required,
        recommended_rule_ids: recommendedDeduped,
        explicit_rule_levels_v1: input.explicit_rule_levels_v1,
        isEnforceable,
    });

    const prev = parseLifecycleProgressionRequirementsOverride(input.existingMetadata) ?? {
        version: 1 as const,
        stages: {},
    };

    const stages = {
        ...prev.stages,
        [input.stage]: {
            field_rules: storedFieldRulesToMetadataFieldRules(dualWrite),
            required_labels: derived.required_labels,
            recommended_labels: derived.recommended_labels,
        },
    };

    return {
        [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
            version: 1,
            stages,
        },
    };
}

function normalizeLabelList(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out;
}

export function parseLifecycleProgressionRequirementsOverride(
    metadata: Record<string, unknown> | null | undefined
): LifecycleProgressionRequirementsOverrideV1 | null {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata[LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY];
    if (!root || typeof root !== "object" || Array.isArray(root)) return null;
    const version = (root as { version?: unknown }).version;
    if (version !== 1) return null;
    const stagesRaw = (root as { stages?: unknown }).stages;
    if (!stagesRaw || typeof stagesRaw !== "object" || Array.isArray(stagesRaw)) return null;

    const stages: LifecycleProgressionRequirementsOverrideV1["stages"] = {};
    for (const [key, value] of Object.entries(stagesRaw as Record<string, unknown>)) {
        if (!isStageKey(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
        const required_labels = normalizeLabelList((value as { required_labels?: unknown }).required_labels);
        const recommended_labels = normalizeLabelList((value as { recommended_labels?: unknown }).recommended_labels);
        const field_rulesStored = parseStageFieldRulesStored((value as { field_rules?: unknown }).field_rules);
        const field_rules = field_rulesStored
            ? {
                  required_rule_ids: field_rulesStored.required_rule_ids,
                  recommended_rule_ids: field_rulesStored.recommended_rule_ids,
                  ...(field_rulesStored.rule_levels_v1 ? { rule_levels_v1: field_rulesStored.rule_levels_v1 } : {}),
              }
            : null;
        if (required_labels === null && recommended_labels === null && !field_rules) continue;
        stages[key] = {
            ...(required_labels !== null ? { required_labels } : {}),
            ...(recommended_labels !== null ? { recommended_labels } : {}),
            ...(field_rules ? { field_rules } : {}),
        };
    }
    if (Object.keys(stages).length === 0) return null;
    return { version: 1, stages };
}

/** All labels that may appear on a stage (platform required + recommended). */
export function lifecycleStageLabelPalette(stage: LifecycleOperatorStage): string[] {
    const platform = platformLifecycleProgressionRequirementsForStage(stage);
    const labels = [
        ...platform.required.map((r) => r.label),
        ...platform.recommended.map((r) => r.label),
    ];
    const locked = LIFECYCLE_LOCKED_LABEL_REASONS[stage];
    if (locked) {
        for (const label of Object.keys(locked)) {
            if (!labels.includes(label)) labels.push(label);
        }
    }
    return labels;
}

function rowsFromLabels(labels: string[], kind: "required" | "recommended"): LifecycleProgressionRequirementRow[] {
    return labels.map((label) => ({ label, kind }));
}

function validateLabelsForStage(stage: LifecycleOperatorStage, labels: string[]): string[] | null {
    const palette = new Set(lifecycleStageLabelPalette(stage));
    const out: string[] = [];
    for (const label of labels) {
        if (!palette.has(label)) return null;
        if (!out.includes(label)) out.push(label);
    }
    return out;
}

export function departmentHasStageOverride(
    override: LifecycleProgressionRequirementsOverrideV1 | null,
    stage: LifecycleOperatorStage
): boolean {
    return override?.stages?.[stage] !== undefined;
}

export function effectiveLifecycleProgressionRequirementsForStage(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null
): {
    required: LifecycleProgressionRequirementRow[];
    recommended: LifecycleProgressionRequirementRow[];
    source: LifecycleRequirementsSource;
} {
    const platform = platformLifecycleProgressionRequirementsForStage(stage);
    const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
    const stageOverride = override?.stages?.[stage];
    if (!stageOverride) {
        return { required: platform.required, recommended: platform.recommended, source: "platform" };
    }

    const requiredLabels =
        stageOverride.required_labels ??
        platform.required.map((r) => r.label);
    const recommendedLabels =
        stageOverride.recommended_labels ??
        platform.recommended.map((r) => r.label);

    const requiredSet = new Set(requiredLabels);
    const recommendedFiltered = recommendedLabels.filter((l) => !requiredSet.has(l));

    return {
        required: rowsFromLabels([...requiredSet], "required"),
        recommended: rowsFromLabels(recommendedFiltered, "recommended"),
        source: "department",
    };
}

export function buildLifecycleRequirementsOverridePatch(input: {
    stage: LifecycleOperatorStage;
    required_labels: string[];
    recommended_labels: string[];
    existingMetadata: Record<string, unknown> | null;
}): Record<string, unknown> {
    const required = validateLabelsForStage(input.stage, input.required_labels);
    const recommended = validateLabelsForStage(input.stage, input.recommended_labels);
    if (!required || !recommended) {
        throw new Error("Invalid lifecycle requirement labels for this stage.");
    }
    const requiredSet = new Set(required);
    const recommendedDeduped = recommended.filter((l) => !requiredSet.has(l));

    const prev = parseLifecycleProgressionRequirementsOverride(input.existingMetadata) ?? {
        version: 1 as const,
        stages: {},
    };
    const stages = { ...prev.stages, [input.stage]: { required_labels: required, recommended_labels: recommendedDeduped } };

    return {
        [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
            version: 1,
            stages,
        },
    };
}

export function buildLifecycleRequirementsResetStagePatch(input: {
    stage: LifecycleOperatorStage;
    existingMetadata: Record<string, unknown> | null;
}): Record<string, unknown> | null {
    const prev = parseLifecycleProgressionRequirementsOverride(input.existingMetadata);
    if (!prev?.stages?.[input.stage]) return null;
    const stages = { ...prev.stages };
    delete stages[input.stage];
    if (Object.keys(stages).length === 0) {
        return { [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: null };
    }
    return {
        [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
            version: 1,
            stages,
        },
    };
}

export function lifecycleLockedLabelReason(
    stage: LifecycleOperatorStage,
    label: string
): string | null {
    return LIFECYCLE_LOCKED_LABEL_REASONS[stage]?.[label] ?? null;
}

export function departmentMetadataFromCompletionContext(
    related?: { department_metadata?: Record<string, unknown> | null } | null
): Record<string, unknown> | null {
    const md = related?.department_metadata;
    return md && typeof md === "object" && !Array.isArray(md) ? md : null;
}
