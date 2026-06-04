import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("buildOpportunityVmLifecycleRailModel", () => {
    const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;

    it("renders stages from VM workspace queue_definition", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: def,
            },
            above_fold: {
                render_model: minimalSettledOpportunityDrawerViewModel().above_fold.render_model,
                record: { status_key: "tour_scheduled" },
            },
        });
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm: vm,
            drawerId: "opp-1",
        });
        expect(model).not.toBeNull();
        expect(model!.steps.map((s) => s.label)).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(model!.currentIndex).toBe(1);
        expect(model!.steps[1]?.state).toBe("current");
    });

    it("reflects custom section labels from queue_definition ui config", () => {
        const customDef = structuredClone(def);
        const ui = (customDef as { ui?: { sections?: Array<{ label?: string; queue_keys: string[] }> } }).ui;
        if (ui?.sections?.[0]) {
            ui.sections[0].label = "Custom Intake Lane";
        }
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: customDef,
            },
            above_fold: {
                render_model: minimalSettledOpportunityDrawerViewModel().above_fold.render_model,
                record: { status_key: "new_inquiry" },
            },
        });
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm: vm,
            drawerId: "opp-1",
        });
        expect(model!.steps[0]?.label).toBe("Custom Intake Lane");
    });

    it("derives current stage from record status_key, not hardcoded index", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: def,
            },
            above_fold: {
                render_model: minimalSettledOpportunityDrawerViewModel().above_fold.render_model,
                record: { status_key: "waitlisted" },
            },
        });
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm: vm,
            drawerId: "opp-1",
        });
        expect(model!.currentIndex).toBe(3);
        expect(model!.steps[3]?.state).toBe("current");
    });

    it("returns null without queue_definition — no enrollment fallback", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: null,
            },
        });
        expect(
            buildOpportunityVmLifecycleRailModel({
                displayVm: vm,
                drawerId: "opp-1",
            })
        ).toBeNull();
    });
});

describe("OpportunityDrawerVmRuntime lifecycle placement", () => {
    it("renders lifecycle rail below tab strip in drawer body", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("data-opportunity-drawer-tab-strip");
        expect(runtime).toContain("data-opportunity-drawer-lifecycle-rail-wrap");
        expect(runtime).toMatch(
            /data-opportunity-drawer-tab-strip[\s\S]{0,2400}data-opportunity-drawer-lifecycle-rail-wrap/
        );
        expect(runtime).not.toContain("postTabStrip=");
    });

    it("does not use enrollment pipeline fallback in VM runtime", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("buildOpportunityVmLifecycleRailModel");
        expect(runtime).not.toContain("allowEnrollmentFallback");
        expect(runtime).not.toContain("resolveOpportunityDrawerQueueDefinition");
        expect(runtime).not.toContain("RecordLifecycleRailSkeleton");
    });

    it("does not hardcode lifecycle stage labels in VM runtime", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).not.toContain("New Leads");
        expect(runtime).not.toContain("Follow Up");
    });
});
