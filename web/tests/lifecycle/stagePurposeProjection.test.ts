import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageOperatingPlanPurpose } from "@/lib/lifecycle/resolveStageOperatingPlanPurpose";
import { STAGE_OPERATING_PLAN_METADATA_KEY } from "@/lib/lifecycle/stageOperatingPlanV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

function enrollmentDepartmentMetadata(): Record<string, unknown> {
    const leadPlan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const qualificationPlan = defaultStageOperatingPlanForEnrollmentStage("qualification")!;
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "s1",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            [STAGE_OPERATING_PLAN_METADATA_KEY]: leadPlan,
                        },
                        {
                            id: "s2",
                            key: "qualification",
                            label: "Qualification",
                            sort_order: 1,
                            is_active: true,
                            [STAGE_OPERATING_PLAN_METADATA_KEY]: qualificationPlan,
                        },
                    ],
                },
            ],
        },
    };
}

describe("resolveStageOperatingPlanPurpose", () => {
    it("projects lead purpose from saved operating plan", () => {
        expect(
            resolveStageOperatingPlanPurpose({
                departmentMetadata: enrollmentDepartmentMetadata(),
                builderStageKey: "lead",
            }),
        ).toEqual({
            stage_key: "lead",
            stage_label: "Lead",
            purpose: "Reach the family and confirm interest.",
        });
    });

    it("projects qualification purpose from saved operating plan", () => {
        expect(
            resolveStageOperatingPlanPurpose({
                departmentMetadata: enrollmentDepartmentMetadata(),
                builderStageKey: "qualification",
            }),
        ).toEqual({
            stage_key: "qualification",
            stage_label: "Qualification",
            purpose: "Confirm fit and gather enrollment details.",
        });
    });

    it("falls back to default enrollment operating plans when stage metadata lacks a saved plan", () => {
        expect(
            resolveStageOperatingPlanPurpose({
                departmentMetadata: {
                    [LIFECYCLE_BUILDER_METADATA_KEY]: {
                        version: 1,
                        active_process_id: "proc-1",
                        processes: [
                            {
                                id: "proc-1",
                                key: "enrollment",
                                name: "Enrollment",
                                primary_entity: "opportunity",
                                sort_order: 0,
                                is_active: true,
                                stages: [
                                    {
                                        id: "s1",
                                        key: "lead",
                                        label: "Lead",
                                        sort_order: 0,
                                        is_active: true,
                                    },
                                ],
                            },
                        ],
                    },
                },
                builderStageKey: "lead",
            }),
        ).toEqual({
            stage_key: "lead",
            stage_label: "Lead",
            purpose: "Reach the family and confirm interest.",
        });
    });

    it("returns null when builder stage cannot be resolved", () => {
        expect(
            resolveStageOperatingPlanPurpose({
                departmentMetadata: enrollmentDepartmentMetadata(),
                builderStageKey: null,
            }),
        ).toBeNull();
    });

    it("returns null when department metadata is missing enrollment builder", () => {
        expect(
            resolveStageOperatingPlanPurpose({
                departmentMetadata: {},
                builderStageKey: "lead",
            }),
        ).toBeNull();
    });
});

describe("OpportunityDrawerViewModel stage_context contract", () => {
    it("compose module wires stage_context from lifecycle rail current stage", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("resolveStageOperatingPlanPurpose");
        expect(compose).toContain("stage_context");
        expect(compose).toContain("lifecycle_rail?.current_stage_key");
    });

    it("drawer VM types declare nullable stage_context on workspace", () => {
        const types = read("lib/adminV2/viewModel/drawer/types.ts");
        expect(types).toContain("stage_context:");
        expect(types).toContain("stage_key: string");
        expect(types).toContain("purpose: string");
    });

});
