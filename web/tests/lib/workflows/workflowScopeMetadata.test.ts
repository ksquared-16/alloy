import { describe, expect, it } from "vitest";

import {
    buildTourReminderActionScaffolds,
    classifyWorkflowScopeTier,
    parseWorkflowScopeFromMetadata,
    partitionWorkflowsByWorkspaceScope,
} from "@/lib/workflows/workflowScopeMetadata";

const deptA = "11111111-1111-4111-8111-111111111111";
const wuB = "22222222-2222-4222-8222-222222222222";

describe("workflowScopeMetadata", () => {
    it("parses scope from metadata", () => {
        expect(
            parseWorkflowScopeFromMetadata({
                scope: { department_id: deptA, work_unit_id: wuB },
            })
        ).toEqual({ department_id: deptA, work_unit_id: wuB });
    });

    it("classifies work-unit scoped row on work-unit page", () => {
        const tier = classifyWorkflowScopeTier(
            { scope: { department_id: deptA, work_unit_id: wuB } },
            { department_id: deptA, work_unit_id: wuB }
        );
        expect(tier).toBe("work_unit");
    });

    it("partitions scoped before org-wide", () => {
        const parts = partitionWorkflowsByWorkspaceScope(
            [
                {
                    id: "w-scoped",
                    name: "Scoped",
                    entity_type: "opportunity",
                    event_type: "x",
                    enabled: false,
                    steps_count: 1,
                    metadata: { scope: { department_id: deptA, work_unit_id: wuB } },
                },
                {
                    id: "w-org",
                    name: "Org",
                    entity_type: "opportunity",
                    event_type: "y",
                    enabled: true,
                    steps_count: 0,
                    metadata: {},
                },
                {
                    id: "w-legacy",
                    name: "Legacy",
                    entity_type: "opportunity",
                    event_type: "z",
                    enabled: true,
                    steps_count: 1,
                    metadata: null,
                },
            ],
            { department_id: deptA, work_unit_id: wuB }
        );
        expect(parts.scoped_work_unit.map((r) => r.id)).toEqual(["w-scoped"]);
        expect(parts.org_wide.map((r) => r.id)).toEqual(["w-org"]);
        expect(parts.heuristic.map((r) => r.id)).toEqual(["w-legacy"]);
    });

    it("tour reminder scaffold is log-only with intended message metadata", () => {
        const scaffolds = buildTourReminderActionScaffolds(3);
        expect(scaffolds).toHaveLength(1);
        expect(scaffolds[0]!.action_type).toBe("log");
        expect(scaffolds[0]!.assist_scaffold).toBe(true);
        expect((scaffolds[0]!.payload as { intended_action?: { action_type?: string } }).intended_action?.action_type).toBe(
            "create_message"
        );
    });
});
