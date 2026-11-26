/**
 * Lifecycle stage requirement levels — parse, derive, dual-write metadata.
 * @see docs/sprints/archive/06_2026/readiness_phase_1_implementation_plan.md
 */

import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { lifecycleFieldRequirementById } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { RequirementConfigLevel } from "@/lib/completion/readinessTypes";
import { parseRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";
import type { RuleMetaV1 } from "@/lib/lifecycle/requirementTimingTypes";
export type { RuleMetaV1 } from "@/lib/lifecycle/requirementTimingTypes";
export type { RequirementRuleMetaV1, RequirementTiming } from "@/lib/lifecycle/requirementTimingTypes";

/** Levels persisted in metadata (Phase 1). */
export type PersistedRequirementLevel = "recommended" | "required" | "enforced";

export const PERSISTED_REQUIREMENT_LEVELS = [
    "recommended",
    "required",
    "enforced",
] as const satisfies readonly PersistedRequirementLevel[];

export type RuleLevelsV1 = {
    version: 1;
    by_rule_id: Record<string, PersistedRequirementLevel>;
};

export type LifecycleStageFieldRulesStored = LifecycleStageFieldRules & {
    rule_levels_v1?: RuleLevelsV1 | null;
    rule_meta_v1?: RuleMetaV1 | null;
};

export type RuleEnforceableLookup = (ruleId: string) => boolean;

function normalizeRuleIdList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out;
}

function isPersistedLevel(raw: unknown): raw is PersistedRequirementLevel {
    return raw === "recommended" || raw === "required" || raw === "enforced";
}

export function isLifecycleRuleEnforceable(
    ruleId: string,
    palette?: readonly LifecycleFieldPaletteEntry[]
): boolean {
    const trimmed = ruleId.trim();
    if (!trimmed) return false;
    const paletteEntry = palette?.find((entry) => entry.rule_id === trimmed);
    if (paletteEntry) return paletteEntry.runtime_enforced;
    const binding = lifecycleFieldRuleBinding(trimmed);
    if (binding) return binding.runtime_enforced;
    const catalog = lifecycleFieldRequirementById(trimmed);
    return catalog?.runtime_enforced ?? false;
}

export function enforceableLookupFromPalette(
    palette?: readonly LifecycleFieldPaletteEntry[]
): RuleEnforceableLookup {
    return (ruleId: string) => isLifecycleRuleEnforceable(ruleId, palette);
}

export function capPersistedRequirementLevel(
    level: PersistedRequirementLevel,
    enforceable: boolean
): PersistedRequirementLevel {
    if (level === "enforced" && !enforceable) return "required";
    return level;
}

export function parseRuleLevelsV1(raw: unknown): RuleLevelsV1 | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if ((raw as { version?: unknown }).version !== 1) return null;
    const byRaw = (raw as { by_rule_id?: unknown }).by_rule_id;
    if (!byRaw || typeof byRaw !== "object" || Array.isArray(byRaw)) return null;

    const by_rule_id: Record<string, PersistedRequirementLevel> = {};
    for (const [key, value] of Object.entries(byRaw as Record<string, unknown>)) {
        const ruleId = key.trim();
        if (!ruleId || !isPersistedLevel(value)) continue;
        by_rule_id[ruleId] = value;
    }
    if (!Object.keys(by_rule_id).length) return null;
    return { version: 1, by_rule_id };
}

export function parseStoredFieldRules(raw: unknown): LifecycleStageFieldRulesStored | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const required_rule_ids = normalizeRuleIdList((raw as { required_rule_ids?: unknown }).required_rule_ids);
    const recommended_rule_ids = normalizeRuleIdList(
        (raw as { recommended_rule_ids?: unknown }).recommended_rule_ids
    );
    const rule_levels_v1 = parseRuleLevelsV1((raw as { rule_levels_v1?: unknown }).rule_levels_v1);
    const rule_meta_v1 = parseRuleMetaV1((raw as { rule_meta_v1?: unknown }).rule_meta_v1);
    if (!required_rule_ids.length && !recommended_rule_ids.length && !rule_levels_v1 && !rule_meta_v1) {
        return null;
    }
    return {
        required_rule_ids,
        recommended_rule_ids,
        ...(rule_levels_v1 ? { rule_levels_v1 } : {}),
        ...(rule_meta_v1 ? { rule_meta_v1 } : {}),
    };
}

export function derivePersistedLevelFromLegacyArrays(input: {
    ruleId: string;
    required_rule_ids: readonly string[];
    recommended_rule_ids: readonly string[];
    isEnforceable: RuleEnforceableLookup;
}): PersistedRequirementLevel | "off" {
    const ruleId = input.ruleId.trim();
    if (!ruleId) return "off";
    if (input.recommended_rule_ids.includes(ruleId)) return "recommended";
    if (input.required_rule_ids.includes(ruleId)) {
        return input.isEnforceable(ruleId) ? "enforced" : "required";
    }
    return "off";
}

export function deriveRuleLevelsV1FromLegacyFieldRules(
    rules: LifecycleStageFieldRules,
    isEnforceable: RuleEnforceableLookup
): RuleLevelsV1 | null {
    const by_rule_id: Record<string, PersistedRequirementLevel> = {};
    const allIds = [...rules.required_rule_ids, ...rules.recommended_rule_ids];
    for (const ruleId of allIds) {
        const level = derivePersistedLevelFromLegacyArrays({
            ruleId,
            required_rule_ids: rules.required_rule_ids,
            recommended_rule_ids: rules.recommended_rule_ids,
            isEnforceable,
        });
        if (level === "off") continue;
        by_rule_id[ruleId] = capPersistedRequirementLevel(level, isEnforceable(ruleId));
    }
    if (!Object.keys(by_rule_id).length) return null;
    return { version: 1, by_rule_id };
}

export function resolveEffectivePersistedLevel(input: {
    ruleId: string;
    rules: LifecycleStageFieldRules;
    rule_levels_v1?: RuleLevelsV1 | null;
    isEnforceable: RuleEnforceableLookup;
}): PersistedRequirementLevel | "off" {
    const ruleId = input.ruleId.trim();
    if (!ruleId) return "off";

    const explicit = input.rule_levels_v1?.by_rule_id[ruleId];
    if (explicit && isPersistedLevel(explicit)) {
        return capPersistedRequirementLevel(explicit, input.isEnforceable(ruleId));
    }

    return derivePersistedLevelFromLegacyArrays({
        ruleId,
        required_rule_ids: input.rules.required_rule_ids,
        recommended_rule_ids: input.rules.recommended_rule_ids,
        isEnforceable: input.isEnforceable,
    });
}

export function resolveAllEffectivePersistedLevels(input: {
    rules: LifecycleStageFieldRules;
    rule_levels_v1?: RuleLevelsV1 | null;
    isEnforceable: RuleEnforceableLookup;
}): Record<string, PersistedRequirementLevel> {
    const ruleIds = new Set([
        ...input.rules.required_rule_ids,
        ...input.rules.recommended_rule_ids,
        ...Object.keys(input.rule_levels_v1?.by_rule_id ?? {}),
    ]);
    const out: Record<string, PersistedRequirementLevel> = {};
    for (const ruleId of ruleIds) {
        const level = resolveEffectivePersistedLevel({
            ruleId,
            rules: input.rules,
            rule_levels_v1: input.rule_levels_v1,
            isEnforceable: input.isEnforceable,
        });
        if (level !== "off") out[ruleId] = level;
    }
    return out;
}

export function fieldRulesArraysFromPersistedLevels(
    levels: Record<string, PersistedRequirementLevel>
): LifecycleStageFieldRules {
    const required_rule_ids: string[] = [];
    const recommended_rule_ids: string[] = [];
    for (const [ruleId, level] of Object.entries(levels)) {
        if (level === "recommended") {
            recommended_rule_ids.push(ruleId);
        } else if (level === "required" || level === "enforced") {
            required_rule_ids.push(ruleId);
        }
    }
    return { required_rule_ids, recommended_rule_ids };
}

export function buildRuleLevelsV1FromPersistedLevels(
    levels: Record<string, PersistedRequirementLevel>
): RuleLevelsV1 | null {
    const by_rule_id: Record<string, PersistedRequirementLevel> = {};
    for (const [ruleId, level] of Object.entries(levels)) {
        const trimmed = ruleId.trim();
        if (!trimmed || !isPersistedLevel(level)) continue;
        by_rule_id[trimmed] = level;
    }
    if (!Object.keys(by_rule_id).length) return null;
    return { version: 1, by_rule_id };
}

export function buildDualWriteStoredFieldRules(input: {
    required_rule_ids: string[];
    recommended_rule_ids: string[];
    explicit_rule_levels_v1?: RuleLevelsV1 | null;
    explicit_rule_meta_v1?: RuleMetaV1 | null;
    isEnforceable: RuleEnforceableLookup;
}): LifecycleStageFieldRulesStored {
    const requiredSet = new Set(input.required_rule_ids);
    const recommended_rule_ids = input.recommended_rule_ids.filter((id) => !requiredSet.has(id));
    const rules: LifecycleStageFieldRules = {
        required_rule_ids: [...requiredSet],
        recommended_rule_ids,
    };

    let levelsRecord: Record<string, PersistedRequirementLevel>;
    if (
        input.explicit_rule_levels_v1?.by_rule_id &&
        Object.keys(input.explicit_rule_levels_v1.by_rule_id).length > 0
    ) {
        levelsRecord = {};
        for (const [ruleId, rawLevel] of Object.entries(input.explicit_rule_levels_v1.by_rule_id)) {
            const trimmed = ruleId.trim();
            if (!trimmed || !isPersistedLevel(rawLevel)) continue;
            levelsRecord[trimmed] = capPersistedRequirementLevel(rawLevel, input.isEnforceable(trimmed));
        }
        for (const ruleId of [...rules.required_rule_ids, ...rules.recommended_rule_ids]) {
            if (levelsRecord[ruleId]) continue;
            const derived = derivePersistedLevelFromLegacyArrays({
                ruleId,
                required_rule_ids: rules.required_rule_ids,
                recommended_rule_ids: rules.recommended_rule_ids,
                isEnforceable: input.isEnforceable,
            });
            if (derived !== "off") {
                levelsRecord[ruleId] = capPersistedRequirementLevel(derived, input.isEnforceable(ruleId));
            }
        }
    } else {
        levelsRecord = resolveAllEffectivePersistedLevels({
            rules,
            rule_levels_v1: null,
            isEnforceable: input.isEnforceable,
        });
    }

    const rule_levels_v1 = buildRuleLevelsV1FromPersistedLevels(levelsRecord);

    return {
        required_rule_ids: rules.required_rule_ids,
        recommended_rule_ids: rules.recommended_rule_ids,
        ...(rule_levels_v1 ? { rule_levels_v1 } : {}),
        ...(input.explicit_rule_meta_v1 ? { rule_meta_v1: input.explicit_rule_meta_v1 } : {}),
    };
}

/** Map UI/config level to persisted level (suggested/off are not stored). */
export function persistedLevelFromConfigLevel(
    level: RequirementConfigLevel,
    ruleId: string,
    isEnforceable: RuleEnforceableLookup
): PersistedRequirementLevel | "off" {
    switch (level) {
        case "recommended":
            return "recommended";
        case "required":
            return "required";
        case "enforced":
            return capPersistedRequirementLevel("enforced", isEnforceable(ruleId));
        case "off":
        case "suggested":
        default:
            return "off";
    }
}

export function storedFieldRulesToMetadataFieldRules(
    stored: LifecycleStageFieldRulesStored
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        required_rule_ids: stored.required_rule_ids,
        recommended_rule_ids: stored.recommended_rule_ids,
    };
    if (stored.rule_levels_v1) {
        payload.rule_levels_v1 = stored.rule_levels_v1;
    }
    if (stored.rule_meta_v1) {
        payload.rule_meta_v1 = stored.rule_meta_v1;
    }
    return payload;
}
