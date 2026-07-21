"use client";

import { WorkspaceCommandRailShell } from "@/app/adminV2/components/workspace/WorkspaceCommandRailShell";
import { useWorkspaceCommandRailRegistration } from "@/contexts/WorkspaceCommandRailRegistryContext";

/**
 * Shell-level assistant column — BOS host only.
 * Operational Actions render in workspace / Work Unit header chrome (not this column).
 * Configuration and legacy local-rail pages may still register Actions; those render when present.
 */
export default function AdminV2PersistentCommandRail() {
    const { actions } = useWorkspaceCommandRailRegistration();

    return (
        <div
            id="adminv2-adaptive-bos-rail"
            className="adminv2-persistent-command-rail-column flex min-h-0 shrink-0 flex-col"
            data-adminv2-persistent-command-rail="true"
            data-adminv2-workspace-command-column="true"
        >
            <WorkspaceCommandRailShell
                ariaLabel="Operator assistant"
                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell adminv2-persistent-command-rail"
                telemetrySlot={null}
            >
                {actions}
            </WorkspaceCommandRailShell>
        </div>
    );
}
