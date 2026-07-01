import { describe, expect, it } from "vitest";
import { resolveEnrollmentOperatorStageDisplay } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionLabels";

describe("enrollment status operator stage labels", () => {
    it("displays new_inquiry as New Leads", () => {
        const display = resolveEnrollmentOperatorStageDisplay({ statusKey: "new_inquiry" });
        expect(display.label).toBe("New Leads");
        expect(display.rawStatusKey).toBe("new_inquiry");
        expect(display.operatorStageKey).toBe("lead");
    });

    it("does not expose raw status in primary label", () => {
        const display = resolveEnrollmentOperatorStageDisplay({ statusKey: "qualified" });
        expect(display.label).not.toBe("qualified");
        expect(display.label).toMatch(/qualification/i);
    });
});
