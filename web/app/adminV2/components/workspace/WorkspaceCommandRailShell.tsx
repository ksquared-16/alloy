"use client";

import type { ReactNode } from "react";

import { useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { DrawerRegistryActionsRail } from "@/app/adminV2/components/workspace/DrawerRegistryActionsRail";
import { useDrawerCommandRailActionsOptional } from "@/contexts/DrawerCommandRailActionsContext";

type Props = {
    children: ReactNode;
    ariaLabel: string;
    className?: string;
    /** Work-unit command rail: Workflow Telemetry card between Actions and BOS. */
    telemetrySlot?: ReactNode;
};

/**
 * Workspace right command column — Actions, optional telemetry, BOS dock host at bottom.
 */
export function WorkspaceCommandRailShell({
    children,
    ariaLabel,
    className = "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
    telemetrySlot = null,
}: Props) {
    const bosHostRef = useCommandRailBosHostRef();
    const drawerRailActions = useDrawerCommandRailActionsOptional()?.registration;

    const actionsContent =
        drawerRailActions ?
            <CommandRailCollapsibleActionsSection
                actionCount={drawerRailActions.actionCount}
                loading={false}
            >
                <section
                    className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                    data-drawer-command-rail-actions="true"
                    aria-label="Drawer actions"
                >
                    <DrawerRegistryActionsRail
                        actions={drawerRailActions.actions}
                        canMutate={drawerRailActions.canMutate}
                        actionLoadingKey={drawerRailActions.actionLoadingKey}
                        disabledReason={drawerRailActions.disabledReason}
                        onActionSelect={drawerRailActions.onActionSelect}
                    />
                </section>
            </CommandRailCollapsibleActionsSection>
        :   children;

    return (
        <aside
            className={`${className} adminv2-ws-command-rail-with-bos`}
            data-adminv2-workspace-command-rail
            aria-label={ariaLabel}
        >
            <div className="adminv2-ws-command-rail-actions min-h-0 shrink-0 overflow-y-auto overscroll-contain">
                {actionsContent}
            </div>
            {telemetrySlot ?
                <div
                    className="adminv2-ws-command-rail-telemetry min-h-0 shrink-0"
                    data-command-rail-telemetry="true"
                >
                    {telemetrySlot}
                </div>
            :   null}
            <div
                ref={bosHostRef}
                data-adminv2-command-rail-bos-host
                className="adminv2-ws-command-rail-bos-host flex min-h-0 flex-1 flex-col"
            />
        </aside>
    );
}
