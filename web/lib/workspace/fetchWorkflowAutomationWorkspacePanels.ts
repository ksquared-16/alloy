import type { WorkflowScopePartitionV1 } from "@/lib/workflows/workflowScopeMetadata";

export type WorkflowAutomationWorkspaceKpis = {
    runs_today: number;
    failed_last_7d: number;
    running_last_7d: number;
    success_rate_last_7d: number | null;
};

export const DEFAULT_WORKFLOW_AUTOMATION_KPIS: WorkflowAutomationWorkspaceKpis = {
    runs_today: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    success_rate_last_7d: null,
};

export type WorkflowAutomationWorkspacePanelsResult = {
    kpis: WorkflowAutomationWorkspaceKpis;
    partitions: WorkflowScopePartitionV1 | null;
};

export type FetchWorkflowAutomationPanelsParams = {
    department_id: string;
    work_unit_id?: string | null;
    init?: RequestInit;
};

/**
 * Loads workflow KPIs + workspace-scoped summary partitions for dept / work-unit surfaces.
 */
export async function fetchWorkflowAutomationWorkspacePanels(
    params: FetchWorkflowAutomationPanelsParams
): Promise<WorkflowAutomationWorkspacePanelsResult> {
    const { department_id, work_unit_id, init } = params;
    const summaryQs = new URLSearchParams({
        variant: "workspace",
        department_id,
    });
    if (work_unit_id) summaryQs.set("work_unit_id", work_unit_id);

    const [kRes, sRes] = await Promise.all([
        fetch("/api/admin/workflow-runs?list=kpis", init),
        fetch(`/api/admin/workflows/summary?${summaryQs.toString()}`, init),
    ]);

    const kBody = (await kRes.json().catch(() => ({}))) as { kpis?: Partial<WorkflowAutomationWorkspaceKpis> };
    const sJson = (await sRes.json().catch(() => ({}))) as { partitions?: WorkflowScopePartitionV1 };

    return {
        kpis:
            kRes.ok && kBody.kpis ?
                { ...DEFAULT_WORKFLOW_AUTOMATION_KPIS, ...kBody.kpis }
            :   DEFAULT_WORKFLOW_AUTOMATION_KPIS,
        partitions: sRes.ok && sJson.partitions ? sJson.partitions : null,
    };
}
