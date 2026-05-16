"use client";

import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import { KpiStripSkeleton } from "@/components/admin/workspace/KpiStripSkeleton";
import { WorkspaceActionsRailPlaceholder } from "@/components/admin/workspace/WorkspaceActionsRailPlaceholder";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import { DeptPairedOperQueuesSkeleton } from "@/components/admin/workspace/DepartmentPairedOperQueuesSkeleton";

const WORKSPACE_BASE = "/adminV2/workspace";

const DEFAULT_WF_KPIS = {
    runs_today: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    success_rate_last_7d: null as number | null,
};

type Props = {
    /** When known (hydrated page); route `loading.tsx` omits. */
    departmentTitle?: string;
};

/** Shell-first department workspace while dept record loads. */
export function DepartmentWorkspaceColdShell({ departmentTitle = "Department" }: Props) {
    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { label: departmentTitle },
            ]}
            title={departmentTitle}
            subtitle=""
        >
            <DepartmentWorkspaceBridgeShell
                briefTitle={departmentTitle}
                briefSubtitle=""
                signalsSlot={null}
                kpiSlot={<KpiStripSkeleton id="dept-cold-kpi-skeleton" />}
                throughputSlot={<DeptPairedOperQueuesSkeleton throughputTitle="Work Unit Queue" />}
                attentionSlot={null}
                contextSlot={
                    <div className="adminv2-ws-dept-v2-workflows-strip" data-ws-lane-kind="automation_workflows">
                        <AutomationWorkflowsBlock
                            title="Automations"
                            kpisLoading
                            kpis={DEFAULT_WF_KPIS}
                            partitions={null}
                            href="/adminV2/workflows"
                        />
                    </div>
                }
                railSlot={<WorkspaceActionsRailPlaceholder />}
            />
        </WorkspaceChrome>
    );
}
