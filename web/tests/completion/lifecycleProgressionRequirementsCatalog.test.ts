import { describe, expect, it } from "vitest";
import {
    evaluateLifecycleStageProgression,
    lifecycleProgressionRequirementsForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

describe("lifecycleProgressionRequirementsForStage", () => {
    it("qualification requires child and program only in required list", () => {
        const q = lifecycleProgressionRequirementsForStage("qualification");
        expect(q.required.map((r) => r.label)).toEqual(["Child", "Program"]);
        expect(q.recommended.some((r) => r.label === "Desired Start Date")).toBe(true);
    });

    it("lead requires person not child", () => {
        const lead = lifecycleProgressionRequirementsForStage("lead");
        expect(lead.required.map((r) => r.label)).toEqual(["Person"]);
        expect(lead.recommended.some((r) => r.label === "Child")).toBe(true);
    });
});

describe("evaluateLifecycleStageProgression", () => {
    it("qualification missing child surfaces missing_required", () => {
        const snap = evaluateLifecycleStageProgression({
            status_key: "qualification",
            inquiry_children: [],
            primary_person_id: "person-1",
        });
        expect(snap?.stage).toBe("qualification");
        expect(snap?.missing_required).toContain("Child");
        expect(snap?.ready_to_advance).toBe(false);
    });

    it("waitlist requires schedule and start on children", () => {
        const snap = evaluateLifecycleStageProgression({
            status_key: "waitlisted",
            inquiry_children: [
                {
                    id: "ocm-1",
                    program_category_id: "cat-infant",
                    schedule_type: null,
                    start_date: null,
                },
            ],
            primary_person_id: "person-1",
        });
        expect(snap?.missing_required).toEqual(
            expect.arrayContaining(["Desired Schedule", "Desired Start Date"])
        );
    });
});
