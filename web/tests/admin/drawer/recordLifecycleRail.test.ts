import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { resolveRecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";

describe("resolveRecordLifecycleRailModel", () => {
    const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;

    it("derives throughput lanes from work-unit queue_definition — not hardcoded stages", () => {
        const model = resolveRecordLifecycleRailModel({
            queueDefinition: def,
            currentStatusKey: "new_inquiry",
        });
        expect(model).not.toBeNull();
        expect(model!.steps.map((s) => s.key)).toEqual([
            "new_leads",
            "tours",
            "communications_followup",
            "waitlist",
            "enrollment_offers",
            "enrollment_completed",
        ]);
        expect(model!.steps.map((s) => s.label)).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
    });

    it("highlights current stage from status_key via filters_compat_v1", () => {
        const tour = resolveRecordLifecycleRailModel({
            queueDefinition: def,
            currentStatusKey: "tour_scheduled",
        });
        expect(tour?.currentIndex).toBe(1);
        expect(tour?.steps[1]?.state).toBe("current");
        expect(tour?.steps[0]?.state).toBe("complete");

        const waitlist = resolveRecordLifecycleRailModel({
            queueDefinition: def,
            currentStatusKey: "waitlisted",
        });
        expect(waitlist?.currentIndex).toBe(3);
        expect(waitlist?.steps[3]?.state).toBe("current");
        expect(waitlist?.steps[4]?.state).toBe("future");
    });

    it("returns null when queue definition is missing or has no pipeline lanes", () => {
        expect(resolveRecordLifecycleRailModel({ queueDefinition: null, currentStatusKey: "new" })).toBeNull();
        expect(
            resolveRecordLifecycleRailModel({
                queueDefinition: {
                    version: 1,
                    entity_type: "opportunity",
                    queues: [{ key: "all", label: "All", filters: [], sort: [], limit: 50, priority: "standard", display: "list" }],
                },
                currentStatusKey: "new_inquiry",
            })
        ).toBeNull();
    });

    it("marks unknown state when status_key is absent", () => {
        const model = resolveRecordLifecycleRailModel({
            queueDefinition: def,
            currentStatusKey: null,
        });
        expect(model?.currentIndex).toBe(-1);
        expect(model?.steps.every((s) => s.state === "unknown")).toBe(true);
    });
});
