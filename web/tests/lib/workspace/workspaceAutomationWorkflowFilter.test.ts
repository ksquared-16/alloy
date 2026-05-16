import { describe, expect, it } from "vitest";

import { filterWorkflowsForWorkspaceAutomationSurface } from "@/lib/workspace/workspaceAutomationWorkflowFilter";

describe("filterWorkflowsForWorkspaceAutomationSurface", () => {
    it("prefers opportunity and tour_bookings entity types", () => {
        const rows = filterWorkflowsForWorkspaceAutomationSurface([
            { id: "1", name: "Opp flow", entity_type: "opportunity", event_type: "x", enabled: true, steps_count: 1 },
            { id: "2", name: "Job flow", entity_type: "job", event_type: "x", enabled: true, steps_count: 1 },
            { id: "3", name: "Tour flow", entity_type: "tour_bookings", event_type: "x", enabled: false, steps_count: 0 },
        ]);
        expect(rows.map((r) => r.id)).toEqual(["1", "3"]);
    });

    it("falls back to org slice when no enrollment-adjacent rows", () => {
        const rows = filterWorkflowsForWorkspaceAutomationSurface([
            { id: "j1", name: "J", entity_type: "job", event_type: "x", enabled: true, steps_count: 1 },
        ]);
        expect(rows).toHaveLength(1);
    });
});
