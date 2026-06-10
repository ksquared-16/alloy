"use client";

import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { WorkspaceActionRailButton } from "@/app/adminV2/components/workspace/WorkspaceActionRailButton";
import { ADMIN_FORMS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { WORKSPACE_ACTION_RAIL_LIST_COLUMN_CLASS } from "@/lib/adminV2/workspace/workspaceActionRailButton";

const WORKSPACE_ROOT_ACTIONS = [
    {
        id: "forms",
        href: ADMIN_FORMS_HREF,
        label: "Forms (definitions & submissions)",
        prefetch: true,
    },
    {
        id: "inquiries",
        href: "/legacy-admin/opportunities",
        label: "Open inquiries (classic admin)",
        prefetch: false,
    },
    {
        id: "work-units",
        href: "/legacy-admin/system/work-units",
        label: "Work unit registry",
        prefetch: false,
    },
] as const;

/**
 * Workspace root Actions rail — same collapsible pattern and button chrome as work-unit command column.
 */
export function WorkspaceRootActionsRail() {
    return (
        <CommandRailCollapsibleActionsSection actionCount={WORKSPACE_ROOT_ACTIONS.length}>
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-1 pb-1"
                aria-label="Workspace actions"
            >
                <div className={WORKSPACE_ACTION_RAIL_LIST_COLUMN_CLASS}>
                    {WORKSPACE_ROOT_ACTIONS.map((action) => (
                        <WorkspaceActionRailButton
                            key={action.id}
                            as="link"
                            href={action.href}
                            tier="primary"
                            prefetch={action.prefetch}
                        >
                            {action.label}
                        </WorkspaceActionRailButton>
                    ))}
                </div>
            </section>
        </CommandRailCollapsibleActionsSection>
    );
}
