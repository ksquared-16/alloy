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

/**
 * THE STAGE A RECORD IS IN IS NOT ALWAYS THE STATUS IT CARRIES.
 *
 * Measured on staging, on a disposable QA case created through the product's own Create Lead flow:
 *
 *   opportunities.status_key    "open"
 *   opportunities.metadata      { tour_date, tour_time }   — no stage assignment
 *   status_definitions          none at all for this org
 *   open stage work             Conduct Tour, work_intent_key "work_3", lifecycle_stage_key "tour"
 *   published Tour requirement  kind=work, enforcement=blocking, applies_to tour_transition_2
 *
 * Both ends of `tour_transition_2` resolved to null, so `evaluateTransitionRequirementPreflight`
 * was asked about no stage, returned `blockingRequirements: []`, and the preflight answered
 * `canProceed: true`. The PATCH gate reads `preflight.required`, so a BLOCKING requirement with
 * open work let the exit through. The requirement runtime was right; it was asked the wrong
 * question.
 *
 * Both halves are asserted here because either one alone still yields a null end, and a transition
 * with a null end loads no requirements.
 */
describe("detectBuilderStageTransition — the stage a status does not name", () => {
    const deptMeta = enrollmentDepartmentMetadata();

    it("takes the caller's known stage when the status key names none", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "open",
            nextStatusKey: "enrolling",
            departmentMetadata: deptMeta,
            currentBuilderStageKey: "tour",
        });
        expect(result.previousBuilderStageKey).toBe("tour");
        expect(result.stageChanged).toBe(true);
    });

    it("resolves a status key that is itself a configured stage key", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "open",
            nextStatusKey: "tour",
            departmentMetadata: deptMeta,
        });
        expect(result.nextBuilderStageKey).toBe("tour");
    });

    it("without the known stage, the departure stage is the status's, which can be the wrong one", () => {
        /*
         * The regression in one line. `open` carries a legacy canonical mapping to `lead`, so the
         * departure stage is not merely unknown — it is confidently wrong for a case that is
         * standing at Tour, and Tour's exit requirements are never consulted.
         */
        const result = detectBuilderStageTransition({
            previousStatusKey: "open",
            nextStatusKey: "enrolling",
            departmentMetadata: deptMeta,
        });
        expect(result.previousBuilderStageKey).toBe("lead");
        expect(result.previousBuilderStageKey).not.toBe("tour");
    });

    it("an explicit assignment still wins over the same-name fallback", () => {
        const result = detectBuilderStageTransition({
            previousStatusKey: "open",
            nextStatusKey: "tour",
            departmentMetadata: deptMeta,
            // A tenant deliberately pointing a same-named status at another stage is unchanged.
            nextStatusMetadata: { process_stage_key: "enrolled" },
        });
        expect(result.nextBuilderStageKey).toBe("enrolled");
    });

    it("a known stage the process does not define is refused, not trusted", () => {
        // The caller's claim is checked against the published stages; a stage nobody configured
        // falls back to the status-derived answer rather than entering the projection.
        const result = detectBuilderStageTransition({
            previousStatusKey: "open",
            nextStatusKey: "enrolling",
            departmentMetadata: deptMeta,
            currentBuilderStageKey: "not_a_stage",
        });
        expect(result.previousBuilderStageKey).toBe("lead");
    });
});
