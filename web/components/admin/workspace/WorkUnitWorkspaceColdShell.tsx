"use client";

import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import {
    WorkUnitOperationalLaneLoader,
    WorkspaceQuietKpiReserve,
} from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import { WorkUnitLifecycleStyleLoadingCard } from "@/components/admin/workspace/WorkUnitLifecycleStyleLoadingCard";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";

type Props = {
    workUnitTitle?: string;
    departmentTitle?: string;
    departmentId?: string;
    reserveActionsRail?: boolean;
};

/**
 * Stable work-unit chrome while metadata/bootstrap is in flight — oper lane loader only (no framed card skeletons).
 */
export function WorkUnitWorkspaceColdShell({
    workUnitTitle = "Work unit",
    departmentTitle = "Department",
    departmentId,
    reserveActionsRail = false,
}: Props) {
    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[]}
            title={workUnitTitle}
            subtitle=""
        >
            <WorkspaceShellLayout
                surface="work_unit"
                rootClassName="adminv2-ws-work-unit adminv2-ws-wu-v2"
                style={operationalWorkspaceShellStyle({ layer: "work_unit" })}
                railAriaLabel="Decisions and actions"
                primaryColumn={
                    <>
                        <div className="adminv2-ws-dept-v2-control-deck">
                            <div className="adminv2-ws-dept-v2-top-stack">
                                <div className="adminv2-ws-dept-v2-brief">
                                    <div className="adminv2-ws-dept-v2-brief-kicker">Work unit</div>
                                    <div className="adminv2-ws-dept-v2-brief-head-row">
                                        <h2 className="adminv2-ws-dept-v2-brief-headline">{workUnitTitle}</h2>
                                    </div>
                                </div>
                            </div>
                            <div data-workspace-zone="kpi-banner">
                                <WorkspaceQuietKpiReserve id="wu-cold-kpi-quiet-reserve" />
                            </div>
                        </div>
                        <WorkUnitLifecycleStyleLoadingCard />
                        <WorkUnitOperationalLaneLoader />
                    </>
                }
            />
        </WorkspaceChrome>
    );
}
