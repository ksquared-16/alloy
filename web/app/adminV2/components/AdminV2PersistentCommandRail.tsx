"use client";

import { WorkspaceCommandRailShell } from "@/app/adminV2/components/workspace/WorkspaceCommandRailShell";
import { CommandRailDefaultEmptyActions } from "@/app/adminV2/components/workspace/CommandRailDefaultEmptyActions";
import { CommandRailDefaultEmptyTelemetry } from "@/app/adminV2/components/workspace/CommandRailDefaultEmptyTelemetry";
import { useWorkspaceCommandRailRegistryOptional } from "@/contexts/WorkspaceCommandRailRegistryContext";

/**
 * Shell-level operator command rail — persists across route changes within AdminV2 workspace shell.
 * Pages register Actions / Workflow Telemetry via {@link WorkspaceCommandRailRegistrar}.
 */
export default function AdminV2PersistentCommandRail() {
    const registry = useWorkspaceCommandRailRegistryOptional();
    const actions = registry?.registration.actions ?? null;
    const telemetry = registry?.registration.telemetry ?? null;

    return (
        <div
            className="adminv2-persistent-command-rail-column flex min-h-0 shrink-0 flex-col"
            data-adminv2-persistent-command-rail="true"
            data-adminv2-workspace-command-column="true"
        >
            <WorkspaceCommandRailShell
                ariaLabel="Operator command rail"
                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell adminv2-persistent-command-rail"
                telemetrySlot={telemetry ?? <CommandRailDefaultEmptyTelemetry />}
            >
                {actions ?? <CommandRailDefaultEmptyActions />}
            </WorkspaceCommandRailShell>
        </div>
    );
}
