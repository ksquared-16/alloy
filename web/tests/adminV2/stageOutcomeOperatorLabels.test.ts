import { describe, it, expect } from "vitest";
import { OUTCOME_AUTOMATION_OPTIONS } from "@/lib/lifecycle/stageOutcomeAutomation";

describe("OUTCOME_AUTOMATION_OPTIONS — operator-facing language", () => {
    it("contains no legacy or automation terminology", () => {
        const labels = OUTCOME_AUTOMATION_OPTIONS.map((o) => o.label.toLowerCase());
        for (const label of labels) {
            expect(label, `"${label}" should not contain "automation"`).not.toContain("automation");
            expect(label, `"${label}" should not contain "legacy"`).not.toContain("legacy");
        }
    });

    it("uses operator-facing action labels", () => {
        const byValue = Object.fromEntries(OUTCOME_AUTOMATION_OPTIONS.map((o) => [o.value, o.label]));
        expect(byValue["move_to_stage"]).toBe("Move to stage");
        expect(byValue["close_record"]).toBe("Close lead");
        expect(byValue["repeat_work"]).toBe("Create follow-up work");
        expect(byValue["mark_needs_attention"]).toBe("Create attention");
        expect(byValue["none"]).toBe("No action");
        expect(byValue["stay_in_stage"]).toBe("Stay in stage");
    });

    it("does not contain 'record' or 'repeat work item' (raw technical language)", () => {
        const labels = OUTCOME_AUTOMATION_OPTIONS.map((o) => o.label.toLowerCase());
        expect(labels).not.toContain("close record");
        expect(labels).not.toContain("repeat work item");
        expect(labels).not.toContain("mark needs attention");
        expect(labels).not.toContain("no automation");
    });
});
