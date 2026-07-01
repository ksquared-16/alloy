"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
    EMPTY_WORKSPACE_ROUTE_VM,
    type WorkspaceRouteVm,
} from "@/lib/adminV2/runtime/surface/workspaceRouteVm";

/**
 * Client distribution of the server-composed workspace Route VM. The provider is **implementation
 * detail** (React's way of handing the VM to renderers); the architecture is the Route VM itself.
 * Defaults to the empty VM so a render without a server VM behaves as before (additive).
 */
const WorkspaceRouteVmContext = createContext<WorkspaceRouteVm>(EMPTY_WORKSPACE_ROUTE_VM);

export function WorkspaceRouteVmProvider({
    value,
    children,
}: {
    value: WorkspaceRouteVm;
    children: ReactNode;
}) {
    return <WorkspaceRouteVmContext.Provider value={value}>{children}</WorkspaceRouteVmContext.Provider>;
}

/** The canonical server-composed workspace Route VM for this render. */
export function useWorkspaceRouteVm(): WorkspaceRouteVm {
    return useContext(WorkspaceRouteVmContext);
}
