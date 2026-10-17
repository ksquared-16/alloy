/**
 * One Tour control: "Tour · <when>", with Reschedule, Cancel and Record outcome behind it.
 */
import { describe, expect, it, vi } from "vitest";

import { alignTourSupportingActionsForBookingState } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { runCurrentWorkPlanInline } from "@/lib/adminV2/runtime/focusPanel/currentWork/runCurrentWorkPlanInline";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const action = (key: string, label: string, actionRef = key) =>
    ({ key, label, handlerKey: key, actionRef, category: "supporting", placement: "current_work_supporting", resolved: null }) as unknown as CurrentWorkActionVM;

describe("a configured Cancel Tour cancels the booking", () => {
    it("carries the booking id, not its config ref, so execution cancels the real booking", () => {
        const aligned = alignTourSupportingActionsForBookingState(
            [action("schedule_tour", "Schedule Tour"), action("cancel_tour", "Cancel Tour")],
            { scheduled: true, bookingId: "booking-1" },
        );
        const cancel = aligned.find((a) => a.key === "cancel_tour")!;
        expect(cancel.actionRef).toBe("booking-1");
        expect(planCurrentWorkActionExecution(cancel)).toEqual({ kind: "cancel_tour", bookingId: "booking-1" });
    });

    it("runs inline behind a confirmation; declining cancels nothing", async () => {
        const cancelTour = vi.fn(async () => ({ ok: true as const }));
        const mutation = { tour: { cancelTour } } as never;
        const plan = { kind: "cancel_tour" as const, bookingId: "booking-1" };

        expect(runCurrentWorkPlanInline(plan, { mutation, confirm: () => false })).toBe(true);
        expect(cancelTour).not.toHaveBeenCalled();

        expect(runCurrentWorkPlanInline(plan, { mutation, confirm: () => true })).toBe(true);
        expect(cancelTour).toHaveBeenCalledWith("booking-1");
    });

    it("leaves every other plan to its host", () => {
        expect(runCurrentWorkPlanInline({ kind: "record_outcome" }, { confirm: () => true })).toBe(false);
    });
});
