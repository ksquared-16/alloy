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
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";

export type BuilderRequirementUiLevel = "off" | "recommended" | "required" | "enforced";

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
    levels: Record<string, BuilderRequirementUiLevel>
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
        isEnforceable: (ruleId) => enforceableForRule(ruleId, palette),
    });
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
