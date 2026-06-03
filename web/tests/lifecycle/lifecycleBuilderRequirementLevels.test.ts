import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildBuilderStageFieldRulesPatch,
    parseLifecycleBuilderStageFieldRules,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import {
    builderFieldRulesDirty,
    builderStoredFieldRulesFromUiLevels,
    builderUiLevelFromStored,
    builderUiLevelOptionsForField,
    builderUiLevelsFromStored,
    BUILDER_REQUIREMENT_LEVEL_COPY,
} from "@/lib/lifecycle/lifecycleBuilderRequirementLevelsUi";
import { isLifecycleRuleEnforceable } from "@/lib/lifecycle/lifecycleStageRequirementLevels";

const ENFORCEABLE_RULE = "child:program_interest";
const NON_ENFORCEABLE_RULE = "child:date_of_birth";
const RECOMMENDED_RULE = "child:age_group";

const palette = [
    { rule_id: ENFORCEABLE_RULE, runtime_enforced: true },
    { rule_id: NON_ENFORCEABLE_RULE, runtime_enforced: false },
    { rule_id: RECOMMENDED_RULE, runtime_enforced: true },
] as const;

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle builder requirement levels UI", () => {
    it("existing required enforceable rule displays as Enforced", () => {
        const stored = {
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        };
        expect(
            builderUiLevelFromStored({
                ruleId: ENFORCEABLE_RULE,
                stored,
                runtimeEnforced: true,
            })
        ).toBe("enforced");
    });

    it("existing required non-enforceable rule displays as Required", () => {
        const stored = {
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        };
        expect(
            builderUiLevelFromStored({
                ruleId: NON_ENFORCEABLE_RULE,
                stored,
                runtimeEnforced: false,
            })
        ).toBe("required");
        expect(isLifecycleRuleEnforceable(NON_ENFORCEABLE_RULE)).toBe(false);
    });

    it("existing recommended rule displays as Recommended", () => {
        const stored = {
            required_rule_ids: [],
            recommended_rule_ids: [RECOMMENDED_RULE],
        };
        expect(
            builderUiLevelFromStored({
                ruleId: RECOMMENDED_RULE,
                stored,
                runtimeEnforced: true,
            })
        ).toBe("recommended");
    });

    it("user can change Recommended to Required", () => {
        const levels = builderUiLevelsFromStored(palette, {
            required_rule_ids: [],
            recommended_rule_ids: [RECOMMENDED_RULE],
        });
        expect(levels[RECOMMENDED_RULE]).toBe("recommended");

        const draft = builderStoredFieldRulesFromUiLevels(palette, {
            ...levels,
            [RECOMMENDED_RULE]: "required",
        });
        expect(draft.required_rule_ids).toContain(RECOMMENDED_RULE);
        expect(draft.recommended_rule_ids).not.toContain(RECOMMENDED_RULE);
        expect(draft.rule_levels_v1?.by_rule_id[RECOMMENDED_RULE]).toBe("required");
    });

    it("user can change Required to Enforced when enforceable", () => {
        const levels = builderUiLevelsFromStored(palette, {
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "required" },
            },
        });
        expect(levels[ENFORCEABLE_RULE]).toBe("required");

        const draft = builderStoredFieldRulesFromUiLevels(palette, {
            ...levels,
            [ENFORCEABLE_RULE]: "enforced",
        });
        expect(draft.rule_levels_v1?.by_rule_id[ENFORCEABLE_RULE]).toBe("enforced");
        expect(draft.required_rule_ids).toContain(ENFORCEABLE_RULE);
    });

    it("Enforced is unavailable for non-enforceable rules", () => {
        expect(builderUiLevelOptionsForField(false)).toEqual(["off", "recommended", "required"]);
        expect(builderUiLevelOptionsForField(true)).toContain("enforced");

        const draft = builderStoredFieldRulesFromUiLevels(palette, {
            [NON_ENFORCEABLE_RULE]: "enforced",
        });
        expect(draft.rule_levels_v1?.by_rule_id[NON_ENFORCEABLE_RULE]).toBe("required");
    });

    it("saving writes rule_levels_v1.by_rule_id via builder patch", () => {
        const stored = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "enforced",
            [RECOMMENDED_RULE]: "recommended",
        });
        const patch = buildBuilderStageFieldRulesPatch({
            builderStageKey: "tour",
            required_rule_ids: stored.required_rule_ids,
            recommended_rule_ids: stored.recommended_rule_ids,
            existingMetadata: {},
            explicit_rule_levels_v1: stored.rule_levels_v1 ?? null,
        });
        const parsed = parseLifecycleBuilderStageFieldRules(patch);
        const tour = parsed?.by_stage_key.tour;
        expect(tour?.rule_levels_v1?.by_rule_id[ENFORCEABLE_RULE]).toBe("enforced");
        expect(tour?.rule_levels_v1?.by_rule_id[RECOMMENDED_RULE]).toBe("recommended");
    });

    it("saving still writes legacy arrays", () => {
        const stored = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "enforced",
            [RECOMMENDED_RULE]: "recommended",
        });
        const patch = buildBuilderStageFieldRulesPatch({
            builderStageKey: "tour",
            required_rule_ids: stored.required_rule_ids,
            recommended_rule_ids: stored.recommended_rule_ids,
            existingMetadata: {},
            explicit_rule_levels_v1: stored.rule_levels_v1 ?? null,
        });
        const parsed = parseLifecycleBuilderStageFieldRules(patch);
        const tour = parsed?.by_stage_key.tour;
        expect(tour?.required_rule_ids).toContain(ENFORCEABLE_RULE);
        expect(tour?.recommended_rule_ids).toContain(RECOMMENDED_RULE);
    });

    it("removing a rule removes its persisted level", () => {
        const saved = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "enforced",
            [RECOMMENDED_RULE]: "recommended",
        });
        const draft = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "off",
            [RECOMMENDED_RULE]: "recommended",
        });
        expect(draft.rule_levels_v1?.by_rule_id[ENFORCEABLE_RULE]).toBeUndefined();
        expect(draft.required_rule_ids).not.toContain(ENFORCEABLE_RULE);
        expect(builderFieldRulesDirty(saved, draft, palette)).toBe(true);
    });

    it("dirty state detects level-only changes with same legacy arrays", () => {
        const saved = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "required",
        });
        const draft = builderStoredFieldRulesFromUiLevels(palette, {
            [ENFORCEABLE_RULE]: "enforced",
        });
        expect(saved.required_rule_ids).toEqual(draft.required_rule_ids);
        expect(builderFieldRulesDirty(saved, draft, palette)).toBe(true);
    });

    it("editor exposes level controls and dual-write payload", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("lifecycle-field-level-");
        expect(editor).toContain("lifecycle-field-level-helper-");
        expect(editor).toContain("lifecycle-stage-effective-rule-levels");
        expect(editor).toContain("builderStoredFieldRulesFromUiLevels");
        expect(editor).toContain("field_rules: draftRules");
        expect(editor).toContain("BUILDER_REQUIREMENT_LEVEL_COPY");
        expect(BUILDER_REQUIREMENT_LEVEL_COPY.enforced.helper).toContain("Blocks gated actions");
    });

    it("Ready Check validation component is unchanged by level UI", () => {
        const validation = read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx");
        expect(validation).not.toContain("rule_levels_v1");
        expect(validation).not.toContain("builderStoredFieldRulesFromUiLevels");
    });
});
