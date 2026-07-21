"use client";

import type { ReactNode } from "react";

import { useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { DrawerRegistryActionsRail } from "@/app/adminV2/components/workspace/DrawerRegistryActionsRail";
import { useDrawerCommandRailActionsOptional } from "@/contexts/DrawerCommandRailActionsContext";
import { useWorkspaceCommandRailRegistration } from "@/contexts/WorkspaceCommandRailRegistryContext";
import { shouldDrawerReplaceCommandRailActions } from "@/lib/workspace/workUnitRailActionResolution";

type Props = {
    children: ReactNode;
    ariaLabel: string;
    className?: string;
    /** Legacy telemetry slot (unused on Adaptive Workspace). */
    telemetrySlot?: ReactNode;
};

/**
 * Assistant column chrome — optional registered Actions (settings/legacy) + BOS dock host.
 * Workspace / Work Unit Actions live in the primary header band, not here.
 * Manage-menu actions stay in the Focus Panel header.
 */
export function WorkspaceCommandRailShell({
    children,
    ariaLabel,
    className = "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
    telemetrySlot = null,
}: Props) {
    const bosHostRef = useCommandRailBosHostRef();
    const { actionsPlacementSurface } = useWorkspaceCommandRailRegistration();
    const drawerRailActions = useDrawerCommandRailActionsOptional()?.registration;
    const useDrawerActions = shouldDrawerReplaceCommandRailActions({
        pagePlacementSurface: actionsPlacementSurface,
        drawerRegistrationPresent: Boolean(drawerRailActions),
    });

    // Page-owned WU/workspace Actions live in the header band (registrar passes null).
    // Settings/configuration may still register Actions into this column.
    const pageOwnsHeaderActions =
        actionsPlacementSurface === "work_unit" ||
        actionsPlacementSurface === "company" ||
        actionsPlacementSurface === "department";

    const actionsContent =
        !pageOwnsHeaderActions && useDrawerActions && drawerRailActions ?
            <CommandRailCollapsibleActionsSection
                actionCount={drawerRailActions.actionCount}
                loading={false}
            >
                <section
                    className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                    data-drawer-command-rail-actions="true"
                    aria-label="Record actions"
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
            data-ws-command-rail-placement-surface={actionsPlacementSurface ?? undefined}
            aria-label={ariaLabel}
        >
            {actionsContent ?
                <div className="adminv2-ws-command-rail-actions min-h-0 shrink-0 overflow-y-auto overscroll-contain">
                    {actionsContent}
                </div>
            :   null}
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
