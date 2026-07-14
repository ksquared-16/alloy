import { describe, expect, it } from "vitest";

import {
    applyStageWorkSliceToVm,
    markStageWorkErrorOnVm,
    stageWorkStateFromSlice,
} from "@/lib/adminV2/viewModel/drawer/opportunity/applyStageWorkSliceToVm";
import type { OpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

function stageRuntime(overrides?: Partial<StageWorkRuntimeProjection>): StageWorkRuntimeProjection {
    return {
        stage_key: "qualification",
        stage_label: "Qualification",
        template_keys: ["work.follow_up"],
        primary: {
            work_id: "wi-1",
            template_key: "work.follow_up",
            label: "Follow up",
            state: "open",
        },
        additional: [],
        ...(overrides as object),
    } as StageWorkRuntimeProjection;
}

/** Minimal VM carrying only the regions the merge touches — the rest is identity-preserved. */
function vmFixture(): OpportunityDrawerViewModel {
    const header = { title: "Nguyen Family" } as OpportunityDrawerViewModel["header"];
    const layout = { mode: "workflow_v1" } as OpportunityDrawerViewModel["layout"];
    const renderModel = { sections: [{ section_key: "a" }] } as unknown as OpportunityDrawerViewModel["above_fold"]["render_model"];
    const entity = { type: "opportunity", id: "opp-A" } as const;
    return {
        entity,
        header,
        layout,
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        workspace: {
            department_id: "dept-1",
            work_unit_id: "wu-1",
            queue_definition: null,
            lifecycle_rail: { stages: [], current_stage_key: "qualification" },
            stage_context: { stage_key: "qualification", stage_label: "Qualification", purpose: "" },
            work_intent_runtime: null,
            stage_work_runtime: null,
            published_stage_inputs: null,
            stage_work: { status: "pending" },
        },
        summaries: {
            tasks: {
                state: "loaded",
                open_tasks: [
                    { id: "wi-1", title: "Follow up", due_at: null, status: "open", source: "stage_work" },
                    { id: "t-2", title: "Generic task", due_at: null, status: "open", source: "manual" },
                ],
                open_count: 2,
            },
            active_tour_bookings: [],
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        above_fold: {
            render_model: renderModel,
            record: { id: "opp-A", _record_surface: "full" },
        },
    } as unknown as OpportunityDrawerViewModel;
}

const READY_SLICE: OpportunityStageWorkSlice = {
    stage_work_runtime: stageRuntime(),
    published_stage_inputs: null,
    work_intent_runtime: null,
};
const EMPTY_SLICE: OpportunityStageWorkSlice = {
    stage_work_runtime: null,
    published_stage_inputs: null,
    work_intent_runtime: null,
};

describe("stage-work load state (no false flip)", () => {
    it("§4.1 a pending projection is surfaced as pending — never 'no active work'", () => {
        const ctx = buildOperationalContext({
            subjectVm: vmFixture(),
            truth: {},
            perspective: null,
            statusLabel: null,
            canMutate: true,
            subjectId: "opp-A",
            title: "Nguyen Family",
        } as never);
        expect(ctx.stageWorkPending).toBe(true);
        // Pending must NOT masquerade as a resolved runtime.
        expect(ctx.stageWorkRuntime).toBeNull();
    });

    it("§4.2 an authoritative empty slice resolves to the empty state (not pending)", () => {
        const vm = vmFixture();
        const patched = applyStageWorkSliceToVm(vm, EMPTY_SLICE);
        expect(patched.workspace.stage_work).toEqual({ status: "empty" });
        expect(patched.workspace.stage_work_runtime).toBeNull();
        const ctx = buildOperationalContext({
            subjectVm: patched,
            truth: {},
            perspective: null,
            statusLabel: null,
            canMutate: true,
            subjectId: "opp-A",
            title: "Nguyen Family",
        } as never);
        expect(ctx.stageWorkPending).toBe(false);
    });

    it("§4.3 a ready slice patches the Current Work region and re-filters stage-work tasks", () => {
        const vm = vmFixture();
        const patched = applyStageWorkSliceToVm(vm, READY_SLICE);
        expect(patched.workspace.stage_work).toEqual({ status: "ready", value: READY_SLICE.stage_work_runtime });
        expect(patched.workspace.stage_work_runtime).toBe(READY_SLICE.stage_work_runtime);
        // The stage-work task (id wi-1) is removed; the generic task remains.
        expect(patched.summaries.tasks.open_tasks.map((t) => t.id)).toEqual(["t-2"]);
        expect(patched.summaries.tasks.open_count).toBe(1);
        expect(patched.above_fold.record._stage_work_runtime).toBe(READY_SLICE.stage_work_runtime);
    });

    it("§4.4 a failure retains any prior runtime and never blanks Current Work", () => {
        const ready = applyStageWorkSliceToVm(vmFixture(), READY_SLICE);
        const errored = markStageWorkErrorOnVm(ready);
        expect(errored.workspace.stage_work).toEqual({ status: "error", retained: READY_SLICE.stage_work_runtime });
        // A failure from pending (no prior value) is a bare error, still not "empty".
        const erroredFromPending = markStageWorkErrorOnVm(vmFixture());
        expect(erroredFromPending.workspace.stage_work).toEqual({ status: "error" });
    });

    it("§4.5/§4.6 Tier 1 is not recomputed — header, layout, render model, and identity are identity-preserved", () => {
        const vm = vmFixture();
        const patched = applyStageWorkSliceToVm(vm, READY_SLICE);
        expect(patched.header).toBe(vm.header);
        expect(patched.layout).toBe(vm.layout);
        expect(patched.above_fold.render_model).toBe(vm.above_fold.render_model);
        expect(patched.entity).toBe(vm.entity);
    });

    it("stageWorkStateFromSlice maps ready vs empty", () => {
        expect(stageWorkStateFromSlice(READY_SLICE)).toEqual({ status: "ready", value: READY_SLICE.stage_work_runtime });
        expect(stageWorkStateFromSlice(EMPTY_SLICE)).toEqual({ status: "empty" });
    });
});
