import { describe, expect, it } from "vitest";
import { resolveBuilderLifecycleDrawerRailModel } from "@/lib/admin/drawer/resolveBuilderLifecycleDrawerRailModel";

describe("resolveBuilderLifecycleDrawerRailModel", () => {
    const stages = [
        { key: "new_leads", label: "New Leads" },
        { key: "qualification", label: "Qualification" },
        { key: "tours", label: "Tours" },
        { key: "waitlist", label: "Waitlist" },
        { key: "enrolling", label: "Enrolling" },
        { key: "enrolled", label: "Enrolled" },
    ];

    it("renders all configured stages in order with current highlighted", () => {
        const model = resolveBuilderLifecycleDrawerRailModel({
            stages,
            currentStageKey: "qualification",
        });
        expect(model).not.toBeNull();
        expect(model!.steps.map((s) => s.label)).toEqual([
            "New Leads",
            "Qualification",
            "Tours",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(model!.currentIndex).toBe(1);
        expect(model!.steps[0]?.state).toBe("complete");
        expect(model!.steps[1]?.state).toBe("current");
        expect(model!.steps[2]?.state).toBe("future");
    });

    it("returns null for fewer than two stages", () => {
        expect(
            resolveBuilderLifecycleDrawerRailModel({
                stages: [{ key: "only", label: "Only" }],
                currentStageKey: "only",
            })
        ).toBeNull();
    });
});
