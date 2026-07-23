import { describe, expect, it } from "vitest";
import {
    deriveSchedulingWork,
    hasSchedulingWork,
} from "@/lib/scheduling/work/deriveSchedulingWork";
import type {
    ChildScheduling,
    ChildSchedulingStatus,
} from "@/lib/scheduling/projection/schedulingProjectionTypes";

function child(status: ChildSchedulingStatus, name = "Ethan Rivera"): ChildScheduling {
    return {
        child: {
            id: "cm-ethan",
            name,
            program: "Toddler",
            ageGroup: "toddler",
            siteId: "site-1",
            siteName: "Downtown",
        },
        status,
        current: null,
        upcoming: [],
        temporary: [],
        history: [],
        availableCommands: [],
    };
}

describe("deriveSchedulingWork", () => {
    it("produces a Place work item for a needs-placement child, using the first name", () => {
        const items = deriveSchedulingWork(child("needs-placement"));
        expect(items).toHaveLength(1);
        expect(items[0].kind).toBe("needs-placement");
        expect(items[0].actionLabel).toBe("Place Ethan");
        expect(items[0].actionCommandKey).toBe("schedule.create");
    });

    it("produces no work for a scheduled (healthy) child — identity only", () => {
        expect(deriveSchedulingWork(child("scheduled"))).toHaveLength(0);
        expect(hasSchedulingWork(child("scheduled"))).toBe(false);
    });

    it("produces no work for an ended child", () => {
        expect(deriveSchedulingWork(child("ended"))).toHaveLength(0);
    });
});
