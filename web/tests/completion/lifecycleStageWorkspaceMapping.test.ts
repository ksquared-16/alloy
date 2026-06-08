import { describe, expect, it } from "vitest";
import { lifecycleStageWorkspaceAppearance } from "@/lib/completion/lifecycleStageWorkspaceMapping";

describe("lifecycleStageWorkspaceMapping", () => {
    it("qualification maps to Follow Up queue and qualification statuses", () => {
        const a = lifecycleStageWorkspaceAppearance("qualification");
        expect(a.mapped).toBe(true);
        expect(a.queues.some((q) => q.label === "Follow Up")).toBe(true);
        expect(a.statusLabels).toContain("Qualification");
        expect(a.actions).toContain("Add child");
    });

    it("waitlist maps to Waitlist queue", () => {
        const a = lifecycleStageWorkspaceAppearance("waitlist");
        expect(a.queues.some((q) => q.label === "Waitlist")).toBe(true);
        expect(a.statusLabels).toContain("Waitlisted");
    });
});
