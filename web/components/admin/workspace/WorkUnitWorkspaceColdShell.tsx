"use client";

import { CANONICAL_ADMIN_WORKSPACE } from "@/lib/admin/canonicalAdminRoutes";

import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { WorkspaceActionsRailPlaceholder } from "@/components/admin/workspace/WorkspaceActionsRailPlaceholder";
import {
    WorkUnitOperationalLaneLoader,
    WorkspaceQuietKpiReserve,
} from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import { WorkUnitLifecycleStyleLoadingCard } from "@/components/admin/workspace/WorkUnitLifecycleStyleLoadingCard";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";

const WORKSPACE_BASE = CANONICAL_ADMIN_WORKSPACE;

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
    const deptCrumbHref =
        departmentId != null && departmentId.trim()
            ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId.trim())}`
            : undefined;
    const bosRailCopilot = isBosRightRailCopilotEnabledClient();

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={
                bosRailCopilot ?
                    []
                :   [
                        { href: WORKSPACE_BASE, label: "Workspace" },
                        deptCrumbHref ? { href: deptCrumbHref, label: departmentTitle } : { label: departmentTitle },
                        { label: workUnitTitle },
                    ]
            }
            title={workUnitTitle}
            subtitle=""
        >
            <WorkspaceShellLayout
                surface="work_unit"
                rootClassName="adminv2-ws-work-unit adminv2-ws-wu-v2"
                style={operationalWorkspaceShellStyle({ layer: "work_unit" })}
                showRail={reserveActionsRail}
                railAriaLabel="Decisions and actions"
                railContent={reserveActionsRail ? <WorkspaceActionsRailPlaceholder /> : null}
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
