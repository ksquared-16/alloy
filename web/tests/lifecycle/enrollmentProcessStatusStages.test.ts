import { describe, expect, it } from "vitest";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

describe("buildEnrollmentStatusStagesPayload", () => {
    it("groups statuses by effective stage", () => {
        const payload = buildEnrollmentStatusStagesPayload([
            {
                status_key: "new_inquiry",
                status_label: "New Inquiry",
                sort_order: 1,
                metadata: {},
            },
            {
                status_key: "contacted",
                status_label: "Contacted",
                sort_order: 2,
                metadata: { enrollment_operator_stage: "lead" },
            },
            {
                status_key: "lost",
                status_label: "Lost",
                sort_order: 99,
                metadata: { enrollment_operator_stage: "unassigned" },
            },
        ]);

        expect(payload.stages.lead.statuses.map((s) => s.status_key).sort()).toEqual(["contacted", "new_inquiry"]);
        expect(payload.stages.lead.has_custom_assignments).toBe(true);
        expect(payload.unassigned.some((s) => s.status_key === "lost")).toBe(true);
    });
});
