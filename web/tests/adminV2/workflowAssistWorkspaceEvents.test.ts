import { describe, expect, it } from "vitest";

import {
    dispatchWorkflowAutomationRefresh,
    workflowAutomationRefreshMatchesPage,
} from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";

describe("workflowAssistWorkspaceEvents", () => {
    const deptId = "11111111-1111-1111-1111-111111111111";
    const wuId = "22222222-2222-2222-2222-222222222222";

    it("matches department page refresh scope", () => {
        expect(workflowAutomationRefreshMatchesPage({ department_id: deptId }, { department_id: deptId })).toBe(true);
        expect(workflowAutomationRefreshMatchesPage({ department_id: deptId, work_unit_id: wuId }, { department_id: deptId })).toBe(
            false
        );
    });

    it("matches work-unit page refresh scope", () => {
        expect(
            workflowAutomationRefreshMatchesPage(
                { department_id: deptId, work_unit_id: wuId },
                { department_id: deptId, work_unit_id: wuId }
            )
        ).toBe(true);
        expect(
            workflowAutomationRefreshMatchesPage({ department_id: deptId }, { department_id: deptId, work_unit_id: wuId })
        ).toBe(false);
    });

    it("dispatch is safe without window", () => {
        expect(() => dispatchWorkflowAutomationRefresh()).not.toThrow();
    });
});
