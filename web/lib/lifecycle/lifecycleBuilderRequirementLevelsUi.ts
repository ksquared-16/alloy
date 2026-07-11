/**
 * Lifecycle Builder UI helpers for requirement levels (Recommended / Required / Enforced).
 */

import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    buildDualWriteStoredFieldRules,
    resolveEffectivePersistedLevel,
    type LifecycleStageFieldRulesStored,
    type PersistedRequirementLevel,
    type RuleLevelsV1,
    type RuleMetaV1,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { RequirementRuleMetaV1, RequirementTiming } from "@/lib/lifecycle/requirementTimingTypes";
import { buildRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";

export type BuilderRequirementUiLevel = "off" | "recommended" | "required" | "enforced";

export type BuilderRequirementTimingUi = RequirementTiming | "legacy_stage_progress";

export const BUILDER_REQUIREMENT_TIMING_COPY: Record<BuilderRequirementTimingUi, string> = {
    legacy_stage_progress: "During this stage",
    record_creation: "Creating the record",
    stage_progress: "During this stage",
    stage_exit: "Leaving this stage",
    process_completion: "Completing the process",
};

export type BuilderFieldPaletteEntry = {
    rule_id: string;
    runtime_enforced: boolean;
};

export const BUILDER_REQUIREMENT_LEVEL_COPY: Record<
    Exclude<BuilderRequirementUiLevel, "off">,
    { label: string; helper: string }
> = {
    recommended: {
        label: "Recommended",
        helper: "Helpful, but does not block work.",
    },
    required: {
        label: "Required",
        helper: "Expected before moving forward.",
    },
    enforced: {
        label: "Enforced",
        helper: "Blocks gated actions until complete.",
    },
};

function enforceableForRule(
    ruleId: string,
    palette: readonly BuilderFieldPaletteEntry[]
): boolean {
    return palette.find((entry) => entry.rule_id === ruleId)?.runtime_enforced ?? false;
}

export function builderUiLevelFromStored(input: {
    ruleId: string;
    stored: LifecycleStageFieldRules | LifecycleStageFieldRulesStored;
    runtimeEnforced: boolean;
}): BuilderRequirementUiLevel {
    const rule_levels_v1 =
        "rule_levels_v1" in input.stored ? input.stored.rule_levels_v1 : undefined;
    const level = resolveEffectivePersistedLevel({
        ruleId: input.ruleId,
        rules: {
            required_rule_ids: input.stored.required_rule_ids,
            recommended_rule_ids: input.stored.recommended_rule_ids,
        },
        rule_levels_v1,
        isEnforceable: () => input.runtimeEnforced,
    });
    if (level === "off") return "off";
    return level;
}

export function builderUiLevelsFromStored(
    palette: readonly BuilderFieldPaletteEntry[],
    stored: LifecycleStageFieldRules | LifecycleStageFieldRulesStored
): Record<string, BuilderRequirementUiLevel> {
    const out: Record<string, BuilderRequirementUiLevel> = {};
    for (const field of palette) {
        out[field.rule_id] = builderUiLevelFromStored({
            ruleId: field.rule_id,
            stored,
            runtimeEnforced: field.runtime_enforced,
        });
    }
    return out;
}

export function builderStoredFieldRulesFromUiLevels(
    palette: readonly BuilderFieldPaletteEntry[],
    levels: Record<string, BuilderRequirementUiLevel>,
    ruleMetaByRuleId?: Record<string, RequirementRuleMetaV1>,
): LifecycleStageFieldRulesStored {
    const by_rule_id: Record<string, PersistedRequirementLevel> = {};
    const required_rule_ids: string[] = [];
    const recommended_rule_ids: string[] = [];

    for (const field of palette) {
        const level = levels[field.rule_id] ?? "off";
        if (level === "off") continue;
        if (level === "recommended") {
            recommended_rule_ids.push(field.rule_id);
            by_rule_id[field.rule_id] = "recommended";
        } else if (level === "required") {
            required_rule_ids.push(field.rule_id);
            by_rule_id[field.rule_id] = "required";
        } else if (level === "enforced") {
            required_rule_ids.push(field.rule_id);
            by_rule_id[field.rule_id] = field.runtime_enforced ? "enforced" : "required";
        }
    }

    const explicit_rule_levels_v1: RuleLevelsV1 | null = Object.keys(by_rule_id).length
        ? { version: 1, by_rule_id }
        : null;

    return buildDualWriteStoredFieldRules({
        required_rule_ids,
        recommended_rule_ids,
        explicit_rule_levels_v1,
        explicit_rule_meta_v1: buildRuleMetaV1(ruleMetaByRuleId ?? {}),
        isEnforceable: (ruleId) => enforceableForRule(ruleId, palette),
    });
}

export function builderRuleMetaFromUi(
    palette: readonly BuilderFieldPaletteEntry[],
    levels: Record<string, BuilderRequirementUiLevel>,
    timingByRuleId: Record<string, BuilderRequirementTimingUi>,
    transitionMetaByRuleId?: Record<
        string,
        Pick<RequirementRuleMetaV1, "applies_to_transition_keys" | "excluded_transition_keys">
    >,
): Record<string, RequirementRuleMetaV1> {
    const out: Record<string, RequirementRuleMetaV1> = {};
    for (const field of palette) {
        if ((levels[field.rule_id] ?? "off") === "off") continue;
        const timingUi = timingByRuleId[field.rule_id] ?? "legacy_stage_progress";
        const timing: RequirementTiming | undefined =
            timingUi === "legacy_stage_progress" ? undefined : timingUi;
        const transitionMeta = transitionMetaByRuleId?.[field.rule_id];
        out[field.rule_id] = {
            ...(timing ? { timing } : {}),
            ...(transitionMeta?.applies_to_transition_keys?.length
                ? { applies_to_transition_keys: transitionMeta.applies_to_transition_keys }
                : {}),
            ...(transitionMeta?.excluded_transition_keys?.length
                ? { excluded_transition_keys: transitionMeta.excluded_transition_keys }
                : {}),
        };
    }
    return out;
}

export function builderTimingUiFromStored(
    stored: LifecycleStageFieldRulesStored,
    ruleId: string,
): BuilderRequirementTimingUi {
    const meta = stored.rule_meta_v1?.by_rule_id[ruleId];
    const timing = meta?.timing;
    if (!timing) return "legacy_stage_progress";
    const first = Array.isArray(timing) ? timing[0] : timing;
    return first ?? "legacy_stage_progress";
}

export function builderFieldRulesDirty(
    saved: LifecycleStageFieldRulesStored,
    draft: LifecycleStageFieldRulesStored,
    palette: readonly BuilderFieldPaletteEntry[]
): boolean {
    const savedLevels = builderUiLevelsFromStored(palette, saved);
    const draftLevels = builderUiLevelsFromStored(palette, draft);
    for (const field of palette) {
        const a = savedLevels[field.rule_id] ?? "off";
        const b = draftLevels[field.rule_id] ?? "off";
        if (a !== b) return true;
    }
    const savedMeta = JSON.stringify(saved.rule_meta_v1 ?? null);
    const draftMeta = JSON.stringify(draft.rule_meta_v1 ?? null);
    if (savedMeta !== draftMeta) return true;
    return false;
}

export function builderUiLevelOptionsForField(
    runtimeEnforced: boolean
): readonly BuilderRequirementUiLevel[] {
    if (runtimeEnforced) {
        return ["off", "recommended", "required", "enforced"] as const;
    }
    return ["off", "recommended", "required"] as const;
}

export function builderUiLevelButtonLabel(level: BuilderRequirementUiLevel): string {
    switch (level) {
        case "off":
            return "Off";
        case "recommended":
            return "Rec";
        case "required":
            return "Req";
        case "enforced":
            return "Enf";
    }
}
