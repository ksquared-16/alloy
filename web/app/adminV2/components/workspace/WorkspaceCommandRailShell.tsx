"use client";

import type { ReactNode } from "react";

import { useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";
import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";

type Props = {
    children: ReactNode;
    ariaLabel: string;
    className?: string;
};

/**
 * Workspace right command column — actions scroll region with optional BOS dock host at bottom.
 */
export function WorkspaceCommandRailShell({
    children,
    ariaLabel,
    className = "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
}: Props) {
    const bosHostRef = useCommandRailBosHostRef();
    const bosRailCopilot = isBosRightRailCopilotEnabledClient();

    if (!bosRailCopilot) {
        return (
            <aside
                className={className}
                data-adminv2-workspace-command-rail
                aria-label={ariaLabel}
            >
                {children}
            </aside>
        );
    }

    return (
        <aside
            className={`${className} adminv2-ws-command-rail-with-bos`}
            data-adminv2-workspace-command-rail
            aria-label={ariaLabel}
        >
            <div className="adminv2-ws-command-rail-actions min-h-0 shrink-0 overflow-y-auto overscroll-contain">
                {children}
            </div>
            <div
                ref={bosHostRef}
                data-adminv2-command-rail-bos-host
                className="adminv2-ws-command-rail-bos-host flex min-h-0 flex-1 flex-col"
            />
        </aside>
    );
}
