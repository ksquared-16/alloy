import { describe, expect, it } from "vitest";
import {
    parseLifecycleOperatorStage,
    resolveFormsLifecycleRequirementContract,
    toFormsLifecycleEntityType,
} from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";

describe("resolveFormsLifecycleRequirementContract", () => {
    it("parses known lifecycle operator stages", () => {
        expect(parseLifecycleOperatorStage("lead")).toBe("lead");
        expect(parseLifecycleOperatorStage("waitlist")).toBe("waitlist");
        expect(parseLifecycleOperatorStage("invalid")).toBeNull();
    });

    it("resolves platform lead stage field rules without department", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "lead",
            intent: "general",
        });

        expect(contract.stageKey).toBe("lead");
        expect(contract.stageLabel).toBe("Lead");
        expect(contract.requirementsSource).toBe("platform");
        expect(contract.required.some((r) => r.id === "person:first_name")).toBe(true);
        expect(contract.required.some((r) => r.id === "person:last_name")).toBe(true);
        expect(contract.required.every((r) => r.requirementSource === "lifecycle_stage")).toBe(true);
        expect(contract.constraints).toEqual([]);
    });

    it("groups requirements by entity type", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "lead",
            intent: "general",
        });

        const personReq = contract.required.find((r) => r.id === "person:first_name");
        expect(personReq?.entityType).toBe("person");
        expect(personReq?.fieldKey).toBe("first_name");
        expect(personReq?.label).toBe("First Name");

        const childRec = contract.recommended.find((r) => r.entityType === "child");
        if (childRec) {
            expect(toFormsLifecycleEntityType("child")).toBe("child");
        }
    });

    it("uses action intake policy for enrollment_lead at lead stage", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-123",
            stageKey: "lead",
            intent: "enrollment_lead",
        });

        expect(contract.required.some((r) => r.id === "person:first_name")).toBe(true);
        expect(contract.required.some((r) => r.id === "person:last_name")).toBe(true);
        expect(contract.required.some((r) => r.requirementSource === "action_intake")).toBe(true);
        expect(contract.constraints.some((c) => c.kind === "at_least_one")).toBe(true);
        expect(
            contract.constraints.some((c) =>
                c.ruleIds.includes("person:email") && c.ruleIds.includes("person:phone")
            )
        ).toBe(true);
    });

    it("does not apply create_lead policy for enrollment_lead on non-lead stages", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-123",
            stageKey: "waitlist",
            intent: "enrollment_lead",
        });

        expect(contract.stageKey).toBe("waitlist");
        expect(contract.constraints).toEqual([]);
        expect(contract.required.every((r) => r.requirementSource === "lifecycle_stage")).toBe(true);
    });

    it("handles empty department metadata safely", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "enrolled",
            intent: "operational_document",
            departmentMetadata: {},
        });

        expect(contract.required.length).toBeGreaterThan(0);
        expect(contract.stageKey).toBe("enrolled");
    });

    it("dedupes required and recommended rule ids", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "lead",
            intent: "general",
            departmentMetadata: {
                lifecycle_progression_requirements_v1: {
                    version: 1,
                    stages: {
                        lead: {
                            field_rules: {
                                required_rule_ids: [
                                    "person:first_name",
                                    "person:first_name",
                                    "person:last_name",
                                ],
                                recommended_rule_ids: ["person:first_name"],
                            },
                        },
                    },
                },
            },
        });

        const firstNameCount = contract.required.filter((r) => r.id === "person:first_name").length;
        expect(firstNameCount).toBe(1);
    });
});
