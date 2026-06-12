"use client";

import { useEffect, type ReactNode } from "react";

import { useWorkspaceCommandRailRegistryOptional } from "@/contexts/WorkspaceCommandRailRegistryContext";

type Props = {
    actions?: ReactNode | null;
    telemetry?: ReactNode | null;
};

/** Registers page-owned Actions / Workflow Telemetry bodies with the shell-level command rail. */
export function WorkspaceCommandRailRegistrar({ actions = null, telemetry = null }: Props) {
    const ctx = useWorkspaceCommandRailRegistryOptional();

    useEffect(() => {
        if (!ctx) return;
        ctx.register({ actions, telemetry });
        return () => ctx.unregister();
    }, [actions, telemetry, ctx]);

    return null;
}
