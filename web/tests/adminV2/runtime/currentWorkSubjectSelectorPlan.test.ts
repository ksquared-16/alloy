import { describe, expect, it } from "vitest";

import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

function waitlistAction(
    partial: Partial<CurrentWorkActionVM> = {},
): CurrentWorkActionVM {
    return {
        key: "waitlist_child",
        label: "Move to Waitlist",
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: "waitlist_child",
        actionRef: "move_to_waitlist",
        relatedSubjectResolution: "enrollment_child",
        ...partial,
    };
}

describe("planCurrentWorkActionExecution — related-subject waitlist", () => {
    it("opens subject_selector for Move to Waitlist related-subject metadata", () => {
        const plan = planCurrentWorkActionExecution(waitlistAction());
        expect(plan.kind).toBe("open_inline_panel");
        if (plan.kind === "open_inline_panel") {
            expect(plan.surface).toBe("subject_selector");
        }
    });

    it("blocks when related subjects are known empty", () => {
        const plan = planCurrentWorkActionExecution(
            waitlistAction({
                disabled: true,
                disabledReason: "Add a child to this family before moving them to Waitlist.",
                blockedReason: "Add a child to this family before moving them to Waitlist.",
            }),
        );
        expect(plan.kind).toBe("blocked");
        if (plan.kind === "blocked") {
            expect(plan.reason).toMatch(/Add a child/i);
        }
    });

    it("keeps schedule_tour on inline_form", () => {
        const plan = planCurrentWorkActionExecution({
            key: "schedule_tour",
            label: "Schedule Tour",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "schedule_tour",
            actionRef: "schedule_tour",
        });
        expect(plan.kind).toBe("open_inline_panel");
        if (plan.kind === "open_inline_panel") {
            expect(plan.surface).toBe("inline_form");
        }
    });
});
