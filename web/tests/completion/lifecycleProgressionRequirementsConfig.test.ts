import { describe, expect, it } from "vitest";
import {
    buildLifecycleFieldRulesOverridePatch,
    buildLifecycleRequirementsOverridePatch,
    buildLifecycleRequirementsResetStagePatch,
    effectiveFieldRulesForStage,
    effectiveLifecycleProgressionRequirementsForStage,
    parseLifecycleProgressionRequirementsOverride,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { platformLifecycleProgressionRequirementsForStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";

describe("lifecycleProgressionRequirementsConfig merge", () => {
    it("uses platform defaults when no department metadata", () => {
        const platform = platformLifecycleProgressionRequirementsForStage("waitlist");
        const effective = effectiveLifecycleProgressionRequirementsForStage("waitlist", null);
        expect(effective.source).toBe("platform");
        expect(effective.required.map((r) => r.label)).toEqual(platform.required.map((r) => r.label));
    });

    it("applies department override for a stage", () => {
        const metadata = buildLifecycleRequirementsOverridePatch({
            stage: "waitlist",
            required_labels: ["Child", "Program"],
            recommended_labels: [],
            existingMetadata: {},
        });
        const effective = effectiveLifecycleProgressionRequirementsForStage("waitlist", metadata);
        expect(effective.source).toBe("department");
        expect(effective.required.map((r) => r.label)).toEqual(["Child", "Program"]);
        expect(effective.recommended).toEqual([]);
    });

    it("reset stage patch removes override", () => {
        const metadata = buildLifecycleRequirementsOverridePatch({
            stage: "qualification",
            required_labels: ["Child"],
            recommended_labels: ["Program"],
            existingMetadata: {},
        });
        const reset = buildLifecycleRequirementsResetStagePatch({ stage: "qualification", existingMetadata: metadata });
        expect(reset).not.toBeNull();
        const parsed = parseLifecycleProgressionRequirementsOverride(
            reset ? { ...metadata, ...reset } : metadata
        );
        expect(parsed?.stages?.qualification).toBeUndefined();
    });

    it("field rules patch derives object labels and merges effective rules", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "qualification",
            required_rule_ids: ["child:first_name", "child:program_interest"],
            recommended_rule_ids: ["child:desired_schedule"],
            existingMetadata: {},
        });
        const parsed = parseLifecycleProgressionRequirementsOverride(metadata);
        expect(parsed?.stages?.qualification?.field_rules?.required_rule_ids).toEqual([
            "child:first_name",
            "child:program_interest",
        ]);
        expect(parsed?.stages?.qualification?.required_labels).toEqual(
            expect.arrayContaining(["Child", "Program"])
        );
        expect(parsed?.stages?.qualification?.recommended_labels).toContain("Desired Schedule");

        const effective = effectiveFieldRulesForStage("qualification", metadata);
        expect(effective.source).toBe("department");
        expect(effective.rules.required_rule_ids).toContain("child:program_interest");

        const objectEffective = effectiveLifecycleProgressionRequirementsForStage("qualification", metadata);
        expect(objectEffective.required.map((r) => r.label)).toEqual(
            expect.arrayContaining(["Child", "Program"])
        );
    });
});

describe("evaluateLifecycleActionRequirements with overrides", () => {
    const baseCtx: CompletionEvaluationContext = {
        phase: "action",
        entity_type: "opportunity",
        entity_id: "opp-1",
        action_key: "move_to_waitlist",
        status_to: "waitlisted",
        values: {},
        related: {
            inquiry_children: [
                {
                    id: "ocm-1",
                    first_name: "Kid",
                    last_name: "One",
                    program_category_id: "cat-infant",
                    schedule_type: null,
                    start_date: null,
                },
            ],
            department_metadata: buildLifecycleRequirementsOverridePatch({
                stage: "waitlist",
                required_labels: ["Child", "Program"],
                recommended_labels: [],
                existingMetadata: {},
            }),
        },
    };

    it("does not block waitlist when schedule/start removed from required override", () => {
        const result = evaluateLifecycleActionRequirements(baseCtx);
        expect(result.ok).toBe(true);
        expect(result.blocking.some((v) => v.label === "Desired Schedule")).toBe(false);
    });
});
