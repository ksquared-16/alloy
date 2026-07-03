"use client";

import { WorkspaceCommandRailShell } from "@/app/adminV2/components/workspace/WorkspaceCommandRailShell";
import { CommandRailDefaultEmptyActions } from "@/app/adminV2/components/workspace/CommandRailDefaultEmptyActions";
import { useWorkspaceCommandRailRegistration } from "@/contexts/WorkspaceCommandRailRegistryContext";

/**
 * Shell-level operator command rail — persists across route changes within AdminV2 workspace shell.
 * Pages register Actions via {@link WorkspaceCommandRailRegistrar}. The Workflow Telemetry section
 * is intentionally not rendered (removed from every operator surface).
 */
export default function AdminV2PersistentCommandRail() {
    const { actions } = useWorkspaceCommandRailRegistration();

    return (
        <div
            className="adminv2-persistent-command-rail-column flex min-h-0 shrink-0 flex-col"
            data-adminv2-persistent-command-rail="true"
            data-adminv2-workspace-command-column="true"
        >
            <WorkspaceCommandRailShell
                ariaLabel="Operator command rail"
                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell adminv2-persistent-command-rail"
                telemetrySlot={null}
            >
                {actions ?? <CommandRailDefaultEmptyActions />}
            </WorkspaceCommandRailShell>
        </div>
    );
}
