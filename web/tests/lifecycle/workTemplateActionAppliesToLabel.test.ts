import { describe, expect, it } from "vitest";

import { workTemplateActionAppliesToLabel } from "@/lib/lifecycle/workTemplateActionAppliesToLabel";

describe("workTemplateActionAppliesToLabel", () => {
    it("labels Move to Waitlist as Child → Waitlist", () => {
        expect(workTemplateActionAppliesToLabel("move_to_waitlist")).toBe(
            "Applies to: Child → Waitlist",
        );
        expect(workTemplateActionAppliesToLabel("waitlist_child")).toBe(
            "Applies to: Child → Waitlist",
        );
    });

    it("labels Close Lead and Schedule Tour as Family", () => {
        expect(workTemplateActionAppliesToLabel("close_lead")).toBe("Applies to: Family");
        expect(workTemplateActionAppliesToLabel("schedule_tour")).toBe("Applies to: Family");
    });

    it("returns null for unknown refs", () => {
        expect(workTemplateActionAppliesToLabel("send_form")).toBeNull();
    });
});
