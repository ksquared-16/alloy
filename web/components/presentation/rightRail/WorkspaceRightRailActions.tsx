"use client";

/**
 * Presentation Runtime V2 — configured Workspace actions → the PERSISTENT operator command rail.
 *
 * Symmetric to WorkUnitRightRailActions, for the /workspace surface: registers the resolved
 * `surface=workspace` actions into the shell command rail's "Actions (N)" section via
 * WorkspaceCommandRailRegistrar (placement surface `company`). Execution stays on the existing
 * runtime (`applyRegistryResolvedActionClient`, `workspace` surface). Org-level actions like
 * Create Lead have no route department, so the workspace's default department (first process) is
 * baked in. Renders null; empty payload → register nothing → the rail's own default.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    /** Default department for org-level workspace actions (Create Lead). */
    defaultDepartmentId: string | null;
};

export function WorkspaceRightRailActions({ actions, defaultDepartmentId }: Props) {
    const railContent =
        actions.length > 0 ? (
            <CommandRailCollapsibleActionsSection actionCount={actions.length}>
                <WorkspaceCommandRailActionsBody
                    actions={actions}
                    defaultDepartmentId={defaultDepartmentId}
                />
            </CommandRailCollapsibleActionsSection>
        ) : null;

    return (
        <WorkspaceCommandRailRegistrar actions={railContent} actionsPlacementSurface="company" />
    );
}

function WorkspaceCommandRailActionsBody({ actions, defaultDepartmentId }: Props) {
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const [createLeadOpen, setCreateLeadOpen] = useState(false);

    const runAction = useCallback(
        (action: ResolvedActionForClient) => {
            void applyRegistryResolvedActionClient(action, {
                router,
                openDrawer,
                openCreateLead: () => setCreateLeadOpen(true),
                departmentId: defaultDepartmentId,
                workUnitId: null,
                entityId: null,
                context: {
                    surface: "workspace",
                    department_id: defaultDepartmentId,
                    work_unit_id: null,
                },
            });
        },
        [router, openDrawer, defaultDepartmentId],
    );

    return (
        <section
            className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
            data-workspace-command-rail-actions="true"
            aria-label="Workspace actions"
        >
            <ul className="adminv2-command-rail-executable-actions">
                {actions.map((action) => (
                    <li key={action.key}>
                        <button
                            type="button"
                            data-right-rail-action={action.key}
                            title={action.description ?? undefined}
                            onClick={() => runAction(action)}
                            className="adminv2-command-rail-executable-action"
                        >
                            <span className="adminv2-command-rail-executable-action-label">
                                {action.label}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {defaultDepartmentId ? (
                <CreateLeadCommandSurface
                    open={createLeadOpen}
                    departmentId={defaultDepartmentId}
                    workUnitId={null}
                    surface="workspace"
                    onClose={() => setCreateLeadOpen(false)}
                    onOpenCreatedRecord={(opportunityId) => {
                        setCreateLeadOpen(false);
                        router.push(
                            resolveCreatedLeadFocusPanelHref({
                                recordId: opportunityId,
                                currentWorkUnitKey: null,
                            }),
                        );
                    }}
                    onRefresh={() => router.refresh()}
                />
            ) : null}
        </section>
    );
}
