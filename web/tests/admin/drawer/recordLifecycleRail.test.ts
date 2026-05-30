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

describe("Opportunity drawer lifecycle rail wiring", () => {
    it("renders shared RecordLifecycleRail below tabs via postTabStrip", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/Drawer.tsx"), "utf8");
        const shell = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("postTabStrip");
        expect(drawer).toContain("data-adminv2-record-modal-post-tab-strip");
        expect(shell).toContain("postTabStrip={drawerPostTabStrip}");
        expect(shell).toContain("RecordLifecycleRail");
        expect(shell).toContain('data-testid="opportunity-lifecycle-rail"');
    });

    it("does not block drawer body on lifecycle skeleton — rail is separate from body gate", () => {
        const shell = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(shell).toContain("RecordLifecycleRailSkeleton");
        expect(shell).not.toContain("DrawerOpportunityTimelineReserve");
    });

    it("uses resolveRecordLifecycleRailModel instead of inline hardcoded pipeline section", () => {
        const shell = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(shell).toContain("resolveRecordLifecycleRailModel");
        expect(shell).not.toContain("data-opportunity-workflow-timeline");
    });

    it("coerces v2 work-unit queue_definition before lifecycle rail resolution", () => {
        const shell = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(shell).toContain("resolveWorkUnitQueueDefinitionForDrawer");
    });
});

describe("Child drawer lifecycle rail", () => {
    it("uses shared RecordLifecycleRail in postTabStrip below tabs", () => {
        const rail = readFileSync(join(process.cwd(), "components/admin/drawer/RecordLifecycleRail.tsx"), "utf8");
        const shell = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(rail).toContain("data-record-lifecycle-rail");
        expect(shell).toContain("PersonDrawerChildLifecycleRail");
        expect(shell).toContain("personDrawerChildLifecycleRail");
    });
});
