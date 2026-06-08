import { describe, expect, it } from "vitest";

import { partitionWorkflowsForWorkspaceAutomationSurface } from "@/lib/workspace/workspaceAutomationWorkflowFilter";

const deptA = "11111111-1111-4111-8111-111111111111";
const wuB = "22222222-2222-4222-8222-222222222222";

describe("partitionWorkflowsForWorkspaceAutomationSurface", () => {
    it("puts metadata-scoped workflow first on work-unit page", () => {
        const parts = partitionWorkflowsForWorkspaceAutomationSurface(
            [
                {
                    id: "org",
                    name: "Org",
                    entity_type: "opportunity",
                    event_type: "x",
                    enabled: true,
                    steps_count: 1,
                    metadata: {},
                },
                {
                    id: "scoped",
                    name: "Scoped",
                    entity_type: "opportunity",
                    event_type: "x",
                    enabled: false,
                    steps_count: 1,
                    metadata: { scope: { department_id: deptA, work_unit_id: wuB } },
                },
            ],
            { department_id: deptA, work_unit_id: wuB }
        );
        expect(parts.scoped_work_unit[0]?.id).toBe("scoped");
        expect(parts.org_wide.some((r) => r.id === "org")).toBe(true);
    });
});
