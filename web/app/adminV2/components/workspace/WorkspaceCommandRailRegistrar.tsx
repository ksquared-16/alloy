"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useWorkspaceCommandRailRegistryOptional } from "@/contexts/WorkspaceCommandRailRegistryContext";

type Props = {
    actions?: ReactNode | null;
    telemetry?: ReactNode | null;
};

/** Registers page-owned Actions / Workflow Telemetry bodies with the shell-level command rail. */
export function WorkspaceCommandRailRegistrar({ actions = null, telemetry = null }: Props) {
    const register = useWorkspaceCommandRailRegistryOptional()?.register;
    const latestRef = useRef({ actions, telemetry });
    latestRef.current = { actions, telemetry };

    useLayoutEffect(() => {
        register?.(latestRef.current);
    });

    return null;
}
