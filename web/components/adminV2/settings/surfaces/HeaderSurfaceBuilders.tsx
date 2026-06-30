"use client";

/**
 * Workspace Header + Work Unit Header in the Surface Builder — the SAME platform
 * SurfaceBuilder, given a compact header Surface Definition. No cloned builder.
 *
 * Persistence is REAL: each builder loads/publishes live metric_placements
 * (surface=workspace_header / work_unit_header), which the runtime header strips render.
 */

import { useMemo } from "react";

import { SurfaceBuilder } from "@/components/platform/surfaceBuilder/SurfaceBuilder";
import { createHeaderSurfacePersistence } from "@/lib/platform/surfaceBuilder/definitions/headerSurfaceClientPersistence";
import {
    workspaceHeaderSurfaceDefinition,
    workUnitHeaderSurfaceDefinition,
} from "@/lib/platform/surfaceBuilder/definitions/headerSurfaceDefinitions";

function HeaderShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-alloy-stone/15 bg-white" data-header-surface-builder>
            {children}
        </div>
    );
}

export function WorkspaceHeaderSurfaceBuilder() {
    const definition = useMemo(
        () => workspaceHeaderSurfaceDefinition(createHeaderSurfacePersistence("workspace_header")),
        [],
    );
    return <HeaderShell><SurfaceBuilder definition={definition} /></HeaderShell>;
}

export function WorkUnitHeaderSurfaceBuilder() {
    const definition = useMemo(
        () => workUnitHeaderSurfaceDefinition(createHeaderSurfacePersistence("work_unit_header")),
        [],
    );
    return <HeaderShell><SurfaceBuilder definition={definition} /></HeaderShell>;
}
