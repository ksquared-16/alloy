import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import { resolveWorkUnitQueueDefinitionForDrawer } from "@/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer";
import { inspectWorkUnitQueueDefinitionShape } from "@/lib/admin/drawer/inspectWorkUnitQueueDefinitionShape";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("resolveWorkUnitQueueDefinitionForDrawer", () => {
    it("parses bundled v2 coerced def with non-zero lifecycle lanes", () => {
        const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;
        expect(resolveWorkUnitQueueDefinitionForDrawer(def)).not.toBeNull();
        const probe = inspectWorkUnitQueueDefinitionShape(def);
        expect(probe.bundle_load_ok).toBe(true);
        expect(probe.pipeline_lane_count).toBeGreaterThan(0);
    });

    it("parses raw staging v2 JSON (domain_with_attention + sections)", () => {
        const def = resolveWorkUnitQueueDefinitionForDrawer(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        expect(def).not.toBeNull();
        expect(def!.entity_type).toBe("opportunity");
        const probe = inspectWorkUnitQueueDefinitionShape(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        expect(probe.has_ui).toBe(true);
        expect(probe.has_sections).toBe(true);
        expect(probe.bundle_load_ok).toBe(true);
        expect(probe.pipeline_lane_count).toBeGreaterThan(0);
    });

    it("unwraps string JSON and nested definition wrapper", () => {
        const wrapped = {
            definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
        };
        const def = resolveWorkUnitQueueDefinitionForDrawer(JSON.stringify(wrapped));
        expect(def).not.toBeNull();
        expect(inspectWorkUnitQueueDefinitionShape(JSON.stringify(wrapped)).pipeline_lane_count).toBeGreaterThan(
            0
        );
    });
});

describe("buildOpportunityVmLifecycleRailModel", () => {
    const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;

    it("renders stages from VM workspace queue_definition (coerced v1)", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: def,
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
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
        expect(model!.steps.length).toBeGreaterThan(0);
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

    it("renders stages from raw v2 queue_definition in workspace (staging shape)", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
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
        const probe = inspectWorkUnitQueueDefinitionShape(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        expect(probe.bundle_load_ok).toBe(true);
        expect(model).not.toBeNull();
        expect(model!.steps.length).toBeGreaterThan(0);
        expect(model!.steps[0]?.label).toBe("New Leads");
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
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
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
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
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
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
            },
        });
        expect(
            buildOpportunityVmLifecycleRailModel({
                displayVm: vm,
                drawerId: "opp-1",
            })
        ).toBeNull();
    });

    it("prefers builder lifecycle_rail when queue_definition yields a single lane", () => {
        const singleLaneQd = {
            version: 1,
            entity_type: "opportunity",
            queues: [{ key: "qualification_lane", label: "Qualification", filters: [] }],
            ui: {
                layout: "single_section",
                sections: [{ key: "stage", label: "Qualification", queue_keys: ["qualification_lane"] }],
            },
        };
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-qual",
                queue_definition: singleLaneQd,
                lifecycle_rail: {
                    stages: [
                        { key: "new_leads", label: "New Leads" },
                        { key: "qualification", label: "Qualification" },
                        { key: "tours", label: "Tours" },
                    ],
                    current_stage_key: "qualification",
                },
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
            },
            above_fold: {
                render_model: minimalSettledOpportunityDrawerViewModel().above_fold.render_model,
                record: { status_key: "qualified" },
            },
        });
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm: vm,
            drawerId: "opp-1",
        });
        expect(model!.steps.length).toBe(3);
        expect(model!.steps.map((s) => s.label)).toEqual(["New Leads", "Qualification", "Tours"]);
        expect(model!.steps[1]?.state).toBe("current");
    });

    it("shape probe reports keys when lifecycle unavailable", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: { version: 1, entity_type: "job", queues: [] },
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
            },
        });
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm: vm,
            drawerId: "opp-1",
        });
        expect(model).toBeNull();
        expect(
            inspectWorkUnitQueueDefinitionShape({ version: 1, entity_type: "job", queues: [] }).top_level_keys
        ).toContain("version");
    });
});

describe("OpportunityDrawerVmRuntime lifecycle placement", () => {

    it("coerces v2 queue_definition via resolveWorkUnitQueueDefinitionForDrawer", () => {
        const modelSrc = read("lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel.ts");
        expect(modelSrc).toContain("resolveWorkUnitQueueDefinitionForDrawer");
    });

});
