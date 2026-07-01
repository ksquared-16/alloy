/** Dispatched after Workflow Assist apply succeeds so workspace automation panels can refetch. */
export const ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH = "alloy-adminv2-workflow-automation-refresh" as const;

export type WorkflowAutomationRefreshDetail = {
    department_id?: string | null;
    work_unit_id?: string | null;
};

export function dispatchWorkflowAutomationRefresh(detail?: WorkflowAutomationRefreshDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH, { detail: detail ?? {} })
    );
}

export function workflowAutomationRefreshMatchesPage(
    detail: WorkflowAutomationRefreshDetail | undefined,
    page: { department_id: string; work_unit_id?: string | null }
): boolean {
    const d = detail ?? {};
    if (d.department_id && d.department_id !== page.department_id) return false;
    if (page.work_unit_id) {
        if (!d.work_unit_id || d.work_unit_id !== page.work_unit_id) return false;
    } else if (d.work_unit_id) {
        return false;
    }
    return true;
}
