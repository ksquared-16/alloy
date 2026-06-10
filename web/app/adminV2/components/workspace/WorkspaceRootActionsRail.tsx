"use client";

import Link from "next/link";

import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";

const WORKSPACE_ROOT_ACTIONS = [
    {
        id: "forms",
        href: "/admin/forms",
        label: "Forms (definitions & submissions)",
    },
    {
        id: "inquiries",
        href: "/legacy-admin/opportunities",
        label: "Open inquiries (classic admin)",
    },
    {
        id: "work-units",
        href: "/legacy-admin/system/work-units",
        label: "Work unit registry",
    },
] as const;

/**
 * Workspace root Actions rail — same collapsible pattern as work-unit command column.
 */
export function WorkspaceRootActionsRail() {
    return (
        <CommandRailCollapsibleActionsSection actionCount={WORKSPACE_ROOT_ACTIONS.length}>
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-1 pb-1"
                aria-label="Workspace actions"
            >
                <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column gap-2">
                    {WORKSPACE_ROOT_ACTIONS.map((action) => (
                        <Link
                            key={action.id}
                            href={action.href}
                            prefetch={shouldDisableAdminV2LinkPrefetch(action.href) ? false : undefined}
                            className="adminv2-ws-actions-rail-secondary adminv2-ws-workspace-orientation-link text-center no-underline rounded-md font-bold text-[11px] w-full"
                        >
                            {action.label}
                        </Link>
                    ))}
                </div>
            </section>
        </CommandRailCollapsibleActionsSection>
    );
}
