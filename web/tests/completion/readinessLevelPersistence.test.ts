import { describe, expect, it } from "vitest";
import {
    buildLifecycleFieldRulesOverridePatch,
    effectiveFieldRulesForStage,
    parseLifecycleProgressionRequirementsOverride,
    parseStageFieldRulesStored,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    buildBuilderStageFieldRulesPatch,
    parseLifecycleBuilderStageFieldRules,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import {
    buildDualWriteStoredFieldRules,
    capPersistedRequirementLevel,
    derivePersistedLevelFromLegacyArrays,
    isLifecycleRuleEnforceable,
    parseRuleLevelsV1,
    parseStoredFieldRules,
    resolveEffectivePersistedLevel,
    storedFieldRulesToMetadataFieldRules,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";

const ENFORCEABLE_RULE = "child:program_interest";
const NON_ENFORCEABLE_RULE = "child:date_of_birth";
const RECOMMENDED_RULE = "child:age_group";

const catalogEnforceable = (ruleId: string) => isLifecycleRuleEnforceable(ruleId);

describe("readinessLevelPersistence", () => {
    it("legacy recommended array derives recommended", () => {
        const level = derivePersistedLevelFromLegacyArrays({
            ruleId: RECOMMENDED_RULE,
            required_rule_ids: [],
            recommended_rule_ids: [RECOMMENDED_RULE],
            isEnforceable: catalogEnforceable,
        });
        expect(level).toBe("recommended");
    });

    it("legacy required + enforceable derives enforced", () => {
        const level = derivePersistedLevelFromLegacyArrays({
            ruleId: ENFORCEABLE_RULE,
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            isEnforceable: catalogEnforceable,
        });
        expect(level).toBe("enforced");
        expect(isLifecycleRuleEnforceable(ENFORCEABLE_RULE)).toBe(true);
    });

    it("legacy required + not enforceable derives required", () => {
        const level = derivePersistedLevelFromLegacyArrays({
            ruleId: NON_ENFORCEABLE_RULE,
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            isEnforceable: catalogEnforceable,
        });
        expect(level).toBe("required");
        expect(isLifecycleRuleEnforceable(NON_ENFORCEABLE_RULE)).toBe(false);
    });

    it("explicit rule_levels_v1.by_rule_id overrides derived level", () => {
        const rules = {
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        };
        const derived = resolveEffectivePersistedLevel({
            ruleId: ENFORCEABLE_RULE,
            rules,
            rule_levels_v1: null,
            isEnforceable: catalogEnforceable,
        });
        expect(derived).toBe("enforced");

        const explicit = resolveEffectivePersistedLevel({
            ruleId: ENFORCEABLE_RULE,
            rules,
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "recommended" },
            },
            isEnforceable: catalogEnforceable,
        });
        expect(explicit).toBe("recommended");
    });

    it("invalid level falls back safely", () => {
        const parsed = parseRuleLevelsV1({
            version: 1,
            by_rule_id: {
                [NON_ENFORCEABLE_RULE]: "bogus",
                [ENFORCEABLE_RULE]: "enforced",
            },
        });
        expect(parsed?.by_rule_id[ENFORCEABLE_RULE]).toBe("enforced");
        expect(parsed?.by_rule_id[NON_ENFORCEABLE_RULE]).toBeUndefined();

        const stored = parseStoredFieldRules({
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: { version: 2, by_rule_id: { x: "required" } },
        });
        expect(stored?.rule_levels_v1).toBeUndefined();
        expect(stored?.required_rule_ids).toEqual([NON_ENFORCEABLE_RULE]);
    });

    it("serialization preserves legacy arrays", () => {
        const dualWrite = buildDualWriteStoredFieldRules({
            required_rule_ids: [ENFORCEABLE_RULE, NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [RECOMMENDED_RULE],
            isEnforceable: catalogEnforceable,
        });
        const serialized = storedFieldRulesToMetadataFieldRules(dualWrite);
        expect(serialized.required_rule_ids).toEqual([ENFORCEABLE_RULE, NON_ENFORCEABLE_RULE]);
        expect(serialized.recommended_rule_ids).toEqual([RECOMMENDED_RULE]);
        expect(serialized.rule_levels_v1).toBeDefined();
    });

    it("dual-write writes both arrays and rule_levels_v1", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE, NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [RECOMMENDED_RULE],
            existingMetadata: {},
        });
        const fieldRules = parseLifecycleProgressionRequirementsOverride(metadata)?.stages?.qualification
            ?.field_rules;
        expect(fieldRules?.required_rule_ids).toEqual([ENFORCEABLE_RULE, NON_ENFORCEABLE_RULE]);
        expect(fieldRules?.recommended_rule_ids).toEqual([RECOMMENDED_RULE]);
        expect(fieldRules?.rule_levels_v1?.version).toBe(1);
        expect(fieldRules?.rule_levels_v1?.by_rule_id[ENFORCEABLE_RULE]).toBe("enforced");
        expect(fieldRules?.rule_levels_v1?.by_rule_id[NON_ENFORCEABLE_RULE]).toBe("required");
        expect(fieldRules?.rule_levels_v1?.by_rule_id[RECOMMENDED_RULE]).toBe("recommended");
    });

    it("enforced is capped/downgraded when not enforceable", () => {
        expect(capPersistedRequirementLevel("enforced", false)).toBe("required");
        expect(capPersistedRequirementLevel("enforced", true)).toBe("enforced");

        const dualWrite = buildDualWriteStoredFieldRules({
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            explicit_rule_levels_v1: {
                version: 1,
                by_rule_id: { [NON_ENFORCEABLE_RULE]: "enforced" },
            },
            isEnforceable: catalogEnforceable,
        });
        expect(dualWrite.rule_levels_v1?.by_rule_id[NON_ENFORCEABLE_RULE]).toBe("required");
    });

    it("round-trip read/write does not lose rules", () => {
        const patch = buildBuilderStageFieldRulesPatch({
            builderStageKey: "custom_stage_a",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [RECOMMENDED_RULE],
            existingMetadata: {},
        });
        const parsed = parseLifecycleBuilderStageFieldRules(patch);
        const row = parsed?.by_stage_key.custom_stage_a;
        expect(row?.required_rule_ids).toEqual([ENFORCEABLE_RULE]);
        expect(row?.recommended_rule_ids).toEqual([RECOMMENDED_RULE]);
        expect(row?.rule_levels_v1?.by_rule_id[ENFORCEABLE_RULE]).toBe("enforced");
        expect(row?.rule_levels_v1?.by_rule_id[RECOMMENDED_RULE]).toBe("recommended");

        const roundTrip = parseStoredFieldRules(row);
        expect(roundTrip?.required_rule_ids).toEqual([ENFORCEABLE_RULE]);
        expect(roundTrip?.recommended_rule_ids).toEqual([RECOMMENDED_RULE]);
        expect(Object.keys(roundTrip?.rule_levels_v1?.by_rule_id ?? {})).toHaveLength(2);
    });

    it("old configs without rule_levels_v1 remain compatible", () => {
        const legacyMetadata = {
            lifecycle_progression_requirements_v1: {
                version: 1,
                stages: {
                    qualification: {
                        field_rules: {
                            required_rule_ids: [NON_ENFORCEABLE_RULE],
                            recommended_rule_ids: [RECOMMENDED_RULE],
                        },
                        required_labels: ["Child"],
                        recommended_labels: ["Age Group"],
                    },
                },
            },
        };

        const effective = effectiveFieldRulesForStage("qualification", legacyMetadata);
        expect(effective.rules.required_rule_ids).toEqual([NON_ENFORCEABLE_RULE]);
        expect(effective.rules.recommended_rule_ids).toEqual([RECOMMENDED_RULE]);

        const stored = parseStageFieldRulesStored(
            legacyMetadata.lifecycle_progression_requirements_v1.stages.qualification.field_rules
        );
        expect(stored?.rule_levels_v1).toBeUndefined();

        const resolved = resolveEffectivePersistedLevel({
            ruleId: NON_ENFORCEABLE_RULE,
            rules: effective.rules,
            rule_levels_v1: stored?.rule_levels_v1,
            isEnforceable: catalogEnforceable,
        });
        expect(resolved).toBe("required");
    });
});
