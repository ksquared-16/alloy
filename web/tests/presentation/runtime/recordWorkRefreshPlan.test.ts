import { describe, expect, it } from "vitest";

import {
    classifyRecordWorkRefreshKind,
    planRecordWorkRefresh,
} from "@/lib/presentation/runtime/recordWorkRefreshPlan";

describe("planRecordWorkRefresh — What's Next freshness ownership", () => {
    it("classifies program/placement saves as field_readiness", () => {
        expect(classifyRecordWorkRefreshKind("inquiry_child_placement_scope")).toBe("field_readiness");
        expect(classifyRecordWorkRefreshKind("inquiry_child_identity")).toBe("field_readiness");
    });

    it("program/placement: invalidate VM cache, keep stage-work seed, do not reload", () => {
        const plan = planRecordWorkRefresh("inquiry_child_placement_scope");
        expect(plan).toEqual({
            kind: "field_readiness",
            invalidateVmCache: true,
            invalidateStageWork: false,
            reloadDisplayVm: false,
            forceStageWork: false,
            refreshHeaderActions: false,
        });
    });

    it("stage-work outcomes force a fresh VM + stage-work resolve", () => {
        const plan = planRecordWorkRefresh("stage_work_outcome");
        expect(plan.kind).toBe("work_lifecycle");
        expect(plan.invalidateVmCache).toBe(true);
        expect(plan.invalidateStageWork).toBe(true);
        expect(plan.reloadDisplayVm).toBe(true);
        expect(plan.forceStageWork).toBe(true);
    });

    it("tour surfaces refresh header actions without a full What's Next reload", () => {
        const plan = planRecordWorkRefresh("schedule_tour");
        expect(plan.kind).toBe("tour_surface");
        expect(plan.reloadDisplayVm).toBe(false);
        expect(plan.refreshHeaderActions).toBe(true);
        expect(plan.invalidateStageWork).toBe(true);
    });
});
