import { describe, expect, it } from "vitest";
import { alignTourScheduleActionForBookingState } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

function action(partial: Partial<CurrentWorkActionVM> & Pick<CurrentWorkActionVM, "key" | "label">): CurrentWorkActionVM {
    return {
        description: null,
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: partial.key,
        actionRef: partial.key,
        resolved: null,
        ...partial,
    };
}

describe("alignTourScheduleActionForBookingState", () => {
    it("rewrites Schedule tour → Reschedule tour when a booking exists", () => {
        const out = alignTourScheduleActionForBookingState(
            action({ key: "schedule_tour", handlerKey: "schedule_tour", label: "Schedule tour" }),
            true,
        );
        expect(out.key).toBe("reschedule_tour");
        expect(out.handlerKey).toBe("reschedule_tour");
        expect(out.label).toBe("Reschedule Tour");
    });

    it("leaves schedule_tour alone when no tour is booked", () => {
        const inAction = action({ key: "schedule_tour", handlerKey: "schedule_tour", label: "Schedule tour" });
        expect(alignTourScheduleActionForBookingState(inAction, false)).toEqual(inAction);
    });

    it("does not rewrite unrelated actions", () => {
        const inAction = action({ key: "send_form", handlerKey: "send_form", label: "Send form" });
        expect(alignTourScheduleActionForBookingState(inAction, true)).toEqual(inAction);
    });
});
