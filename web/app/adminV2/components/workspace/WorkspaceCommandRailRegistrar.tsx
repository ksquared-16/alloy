"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useWorkspaceCommandRailRegistryOptional } from "@/contexts/WorkspaceCommandRailRegistryContext";
import type { PageCommandRailPlacementSurface } from "@/lib/workspace/workUnitRailActionResolution";

type Props = {
    actions?: ReactNode | null;
    telemetry?: ReactNode | null;
    /** Workspace placement surface that owns the command rail (blocks drawer override). */
    actionsPlacementSurface?: PageCommandRailPlacementSurface | null;
};

/** Registers page-owned Actions / Workflow Telemetry bodies with the shell-level command rail. */
export function WorkspaceCommandRailRegistrar({
    actions = null,
    telemetry = null,
    actionsPlacementSurface = null,
}: Props) {
    const register = useWorkspaceCommandRailRegistryOptional()?.register;
    const latestRef = useRef({ actions, telemetry, actionsPlacementSurface });
    latestRef.current = { actions, telemetry, actionsPlacementSurface };

    useLayoutEffect(() => {
        register?.(latestRef.current);
    });

    return null;
}
