/**
 * STAGE AUTHORITY — a Work View cannot change a case's authoritative process stage.
 *
 * A lens is a COHORT, not a position. Opening the same case from Tour and from All must produce the
 * same `stageKey`, because the stage is a property of the process and the queue is only a way of
 * arriving at it. Getting this wrong would let the route the operator took decide what the record
 * says about itself.
 *
 * The rule is structural rather than defensive: `buildOperationalContext` resolves the stage from
 * `workspace.lifecycle_rail.current_stage_key` (falling back to `stage_context.stage_key`) and holds
 * NO reference to a work unit, lens or queue — so a lens has no seam to write through. This test
 * pins that structure, and is the guard the Business Process card's rail depends on.
 */

import { describe, expect, it } from "vitest";

import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";

/**
 * The same case, composed as each Work View would hand it to the panel. Shaped after the
 * `stageWorkTierContract` fixture so this guard tests the real composition rather than a stub.
 */
function subjectVmFrom(workUnitKey: string, currentStageKey = "tour", stageContextKey = "tour") {
    return {
        entity: { type: "opportunity", id: "opp_1" },
        header: { title: "Wright Family" },
        layout: { mode: "workflow_v1" },
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        workspace: {
            department_id: "dept-1",
            // The LENS differs between the two openings, and nothing else does.
            work_unit_id: workUnitKey,
            queue_definition: null,
            // The canonical stage owner. Identical for both lenses because it belongs to the case.
            lifecycle_rail: { stages: [], current_stage_key: currentStageKey },
            stage_context: { stage_key: stageContextKey, stage_label: "Tour", purpose: "" },
            work_intent_runtime: null,
            stage_work_runtime: null,
            published_stage_inputs: null,
            stage_work: { status: "pending" },
        },
        summaries: {
            tasks: { state: "loaded", open_tasks: [], open_count: 0 },
            active_tour_bookings: [],
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        activity: { communicationsPreviewVm: null },
        above_fold: { render_model: { sections: [] }, record: { id: "opp_1", _record_surface: "full" } },
    };
}

function contextFrom(workUnitKey: string, statusLabel: string | null) {
    return buildOperationalContext({
        subjectVm: subjectVmFrom(workUnitKey),
        subjectId: "opp_1",
        title: "Wright Family",
        truth: {},
        perspective: null,
        statusLabel,
        canMutate: true,
    } as never);
}

describe("Work View cannot alter authoritative process stage", () => {
    it("the same case opened from Tour and from All resolves the same stageKey", () => {
        const fromTour = contextFrom("tours", "Tour");
        const fromAll = contextFrom("all", "All");

        expect(fromTour.businessProcess.stageKey).toBe("tour");
        expect(fromAll.businessProcess.stageKey).toBe("tour");
        expect(fromAll.businessProcess.stageKey).toBe(fromTour.businessProcess.stageKey);
    });

    it("a differing statusLabel per lens cannot reach the stage KEY", () => {
        // The label has a documented `statusLabel` fallback; the key must not. If a lens-supplied
        // label could reach the key, "which queue am I in" would start deciding "where is this case".
        const fromTour = contextFrom("tours", "Touring now");
        const fromAll = contextFrom("all", "Everything");
        expect(fromTour.businessProcess.stageKey).toBe(fromAll.businessProcess.stageKey);
        expect(fromTour.businessProcess.stageKey).toBe("tour");
    });

    it("the lifecycle rail is the authority, and stage_context is only its fallback", () => {
        const ctx = buildOperationalContext({
            // Rail and stage_context DISAGREE. The rail wins, always.
            subjectVm: subjectVmFrom("all", "waitlist", "tour"),
            subjectId: "opp_1",
            title: "Wright Family",
            truth: {},
            perspective: null,
            statusLabel: null,
            canMutate: true,
        } as never);
        expect(ctx.businessProcess.stageKey).toBe("waitlist");
    });

    it("the panel stays case-grain regardless of the lens it was opened from", () => {
        expect(contextFrom("tours", null).grain).toBe("case");
        expect(contextFrom("all", null).grain).toBe("case");
    });
});
