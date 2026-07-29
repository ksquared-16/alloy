import { describe, expect, it } from "vitest";

import {
    applyActiveTourScheduleActionSwap,
    applyActiveTourScheduleActionSwapAll,
    isManageActiveTourAction,
    isScheduleTourAction,
    MANAGE_ACTIVE_TOUR_HANDLER_KEY,
    MANAGE_ACTIVE_TOUR_LABEL,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/applyActiveTourScheduleActionSwap";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

function scheduleAction(partial?: Partial<CurrentWorkActionVM>): CurrentWorkActionVM {
    return {
        key: "schedule_tour",
        label: "Schedule tour",
        category: "primary",
        placement: "current_work_primary",
        handlerKey: "schedule_tour",
        actionRef: "schedule_tour",
        ...partial,
    };
}

describe("applyActiveTourScheduleActionSwap", () => {
    it("leaves schedule_tour untouched when no tour is scheduled", () => {
        const action = scheduleAction();
        expect(applyActiveTourScheduleActionSwap(action, false)).toEqual(action);
        expect(isScheduleTourAction(action)).toBe(true);
        expect(isManageActiveTourAction(action)).toBe(false);
    });

    it("remaps schedule_tour to Reschedule / Cancel when a tour is scheduled", () => {
        const swapped = applyActiveTourScheduleActionSwap(scheduleAction(), true);
        expect(swapped.key).toBe("schedule_tour");
        expect(swapped.label).toBe(MANAGE_ACTIVE_TOUR_LABEL);
        expect(swapped.handlerKey).toBe(MANAGE_ACTIVE_TOUR_HANDLER_KEY);
        expect(swapped.actionRef).toBe(MANAGE_ACTIVE_TOUR_HANDLER_KEY);
        expect(isManageActiveTourAction(swapped)).toBe(true);
        expect(isScheduleTourAction(swapped)).toBe(false);
    });

    it("does not remap unrelated actions", () => {
        const other: CurrentWorkActionVM = {
            key: "send_form",
            label: "Send form",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "send_form",
            actionRef: "send_form",
        };
        expect(applyActiveTourScheduleActionSwap(other, true)).toEqual(other);
    });

    it("maps the remapped action to the tour lifecycle choice host", () => {
        const swapped = applyActiveTourScheduleActionSwap(scheduleAction(), true);
        expect(resolveCurrentWorkActionSurface(swapped)).toBe("tour_lifecycle_choice");
        expect(planCurrentWorkActionExecution(swapped)).toEqual({
            kind: "tour_lifecycle_choice",
            action: swapped,
        });
    });

    it("swaps all schedule_tour entries in a list when a tour is scheduled", () => {
        const actions = [
            scheduleAction(),
            {
                key: "quick_message",
                label: "Message",
                category: "communication" as const,
                placement: "communications_inline" as const,
                handlerKey: "quick_message",
                actionRef: "quick_message",
            },
        ];
        const swapped = applyActiveTourScheduleActionSwapAll(actions, true);
        expect(swapped[0]?.label).toBe(MANAGE_ACTIVE_TOUR_LABEL);
        expect(swapped[1]?.label).toBe("Message");
    });
});
