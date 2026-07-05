/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";

describe("resolveChildProcessStageLabel — Process Stage replaces Participation Status", () => {
    it("prefers the child's own stage_key (true Process Stage)", () => {
        expect(resolveChildProcessStageLabel({ stageKey: "waitlist" })).toBe("Waitlist");
        expect(resolveChildProcessStageLabel({ stageKey: "enrolled" })).toBe("Enrolled");
        // stage_key wins even when a disposition is also present
        expect(resolveChildProcessStageLabel({ stageKey: "enrolling", dispositionKey: "waitlisted" })).toBe("Enrolling");
    });

    it("maps the stage-equivalent disposition when no stage_key is present (compat bridge)", () => {
        expect(resolveChildProcessStageLabel({ dispositionKey: "waitlisted" })).toBe("Waitlist");
        expect(resolveChildProcessStageLabel({ dispositionKey: "enrolling" })).toBe("Enrolling");
        expect(resolveChildProcessStageLabel({ dispositionKey: "enrolled" })).toBe("Enrolled");
        expect(resolveChildProcessStageLabel({ dispositionKey: "withdrawn" })).toBe("Closed / Withdrawn");
        expect(resolveChildProcessStageLabel({ dispositionKey: "not_enrolling" })).toBe("Closed / Withdrawn");
    });

    it("undispositioned / brand-new lead maps to the Lead stage", () => {
        expect(resolveChildProcessStageLabel({ dispositionKey: "new_inquiry" })).toBe("New Lead");
        expect(resolveChildProcessStageLabel({ dispositionKey: "open" })).toBe("New Lead");
    });

    it("falls back to the family stage it's riding when nothing else is known", () => {
        expect(resolveChildProcessStageLabel({ familyStageKey: "tour" })).toBe("Tour");
    });

    it("returns null when nothing is known (badge suppressed)", () => {
        expect(resolveChildProcessStageLabel({})).toBeNull();
        expect(resolveChildProcessStageLabel({ dispositionKey: "  " })).toBeNull();
        expect(resolveChildProcessStageLabel({ dispositionKey: "not_a_real_key" })).toBeNull();
    });
});
