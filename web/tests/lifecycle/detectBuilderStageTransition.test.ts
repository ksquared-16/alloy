import { describe, expect, it } from "vitest";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";

function enrollmentDepartmentMetadata(): Record<string, unknown> {
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
                        { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true },
                        { id: "s2", key: "qualification", label: "Qualification", sort_order: 1, is_active: true },
                        { id: "s3", key: "tour", label: "Tour", sort_order: 2, is_active: true },
                        { id: "s4", key: "enrolling", label: "Enrolling", sort_order: 3, is_active: true },
                        { id: "s5", key: "enrolled", label: "Enrolled", sort_order: 4, is_active: true },
                    ],
                },
            ],
        },
    };
}

describe("detectBuilderStageTransition", () => {
    const deptMeta = enrollmentDepartmentMetadata();

    it("detects lead entry from null → new_inquiry", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: null,
            nextStatusKey: "new_inquiry",
            departmentMetadata: deptMeta,
        });
        expect(result.previousBuilderStageKey).toBeNull();
        expect(result.nextBuilderStageKey).toBe("lead");
        expect(result.stageChanged).toBe(true);
    });

    it("does not flag same-stage status updates within lead", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "new_inquiry",
            nextStatusKey: "open",
            departmentMetadata: deptMeta,
        });
        expect(result.previousBuilderStageKey).toBe("lead");
        expect(result.nextBuilderStageKey).toBe("lead");
        expect(result.stageChanged).toBe(false);
    });

    it("detects transition into qualification", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "new_inquiry",
            nextStatusKey: "contacted",
            departmentMetadata: deptMeta,
        });
        expect(result.previousBuilderStageKey).toBe("lead");
        expect(result.nextBuilderStageKey).toBe("qualification");
        expect(result.stageChanged).toBe(true);
    });

    it("detects re-entry to lead as stage change from enrolled", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "enrolled",
            nextStatusKey: "new_inquiry",
            departmentMetadata: deptMeta,
        });
        expect(result.previousBuilderStageKey).toBe("enrolled");
        expect(result.nextBuilderStageKey).toBe("lead");
        expect(result.stageChanged).toBe(true);
    });
});
