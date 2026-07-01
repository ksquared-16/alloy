import { describe, expect, it } from "vitest";
import {
    deriveObjectLabelsFromFieldRules,
    fieldRulesHaveRuntimeGaps,
    lifecycleFieldPaletteForStage,
    platformFieldRulesForStage,
    validateFieldRuleIdsForStage,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

describe("lifecycleFieldRequirementsCatalog", () => {
    it("platformFieldRulesForStage maps qualification object labels to field ids", () => {
        const rules = platformFieldRulesForStage("qualification");
        expect(rules.required_rule_ids).toContain("child:first_name");
        expect(rules.required_rule_ids).toContain("child:program_interest");
    });

    it("deriveObjectLabelsFromFieldRules produces legacy object labels", () => {
        const derived = deriveObjectLabelsFromFieldRules(
            ["child:first_name", "child:program_interest"],
            ["child:desired_schedule"]
        );
        expect(derived.required_labels).toEqual(expect.arrayContaining(["Child", "Program"]));
        expect(derived.recommended_labels).toContain("Desired Schedule");
    });

    it("validateFieldRuleIdsForStage rejects ids outside palette", () => {
        expect(validateFieldRuleIdsForStage("lead", ["person:first_name"])).not.toBeNull();
        expect(validateFieldRuleIdsForStage("lead", ["not-a-real-rule"])).toBeNull();
    });

    it("fieldRulesHaveRuntimeGaps is true when non-enforced fields are selected", () => {
        expect(
            fieldRulesHaveRuntimeGaps({
                required_rule_ids: ["child:date_of_birth"],
                recommended_rule_ids: [],
            })
        ).toBe(true);
        expect(
            fieldRulesHaveRuntimeGaps({
                required_rule_ids: ["child:program_interest"],
                recommended_rule_ids: [],
            })
        ).toBe(false);
        expect(
            fieldRulesHaveRuntimeGaps({
                required_rule_ids: ["custom:person:preferred_language"],
                recommended_rule_ids: [],
            })
        ).toBe(true);
    });

    it("lifecycleFieldPaletteForStage includes tour-only opportunity fields on tour", () => {
        const tourPalette = lifecycleFieldPaletteForStage("tour");
        expect(tourPalette.some((f) => f.field_label === "Tour Date")).toBe(true);
        const leadPalette = lifecycleFieldPaletteForStage("lead");
        expect(leadPalette.some((f) => f.field_label === "Tour Date")).toBe(false);
    });
});
