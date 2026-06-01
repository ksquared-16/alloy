import { describe, expect, it } from "vitest";
import {
    actionMatchesOperatorStage,
    buildEnrollmentProcessStageActionRows,
    operatorStagesForActionCatalog,
} from "@/lib/lifecycle/enrollmentProcessStageActions";

describe("enrollmentProcessStageActions", () => {
    it("maps catalog multi stages to operator stages", () => {
        const stages = operatorStagesForActionCatalog({
            lifecycle_stage: "multi",
            lifecycle_stages: ["qualification", "waitlist"],
        });
        expect(stages).toEqual(expect.arrayContaining(["qualification", "waitlist"]));
    });

    it("includes universal actions on all stages", () => {
        expect(
            actionMatchesOperatorStage("lead", {
                lifecycle_stage: "universal",
                lifecycle_stages: null,
            })
        ).toBe(true);
    });

    it("buildEnrollmentProcessStageActionRows filters by stage", () => {
        const rows = buildEnrollmentProcessStageActionRows("qualification", [
            {
                definition: {
                    key: "schedule_tour",
                    label: "Schedule tour",
                    is_active: true,
                    entity_type: "opportunity",
                    payload_schema: {
                        catalog: {
                            lifecycle_stage: "multi",
                            lifecycle_stages: ["qualification", "waitlist"],
                            implementation_status: "partial",
                        },
                    },
                },
                placements: [
                    {
                        surface: "record_header",
                        slot: "primary",
                        is_active: true,
                        department_id: null,
                        work_unit_id: null,
                    },
                ],
            },
            {
                definition: {
                    key: "approve_enrollment",
                    label: "Approve enrollment",
                    is_active: true,
                    entity_type: "opportunity",
                    payload_schema: {
                        catalog: { lifecycle_stage: "enrollment", lifecycle_stages: null },
                    },
                },
                placements: [],
            },
        ]);
        expect(rows.map((r) => r.key)).toEqual(["schedule_tour"]);
        expect(rows[0]?.operational_note).toContain("Partially");
        expect(rows[0]?.placements[0]?.surface_label).toBe("Drawer Actions");
    });
});
