"use client";

/**
 * Workspace Header + Work Unit Header in the Surface Builder — the SAME platform
 * SurfaceBuilder, given a compact header Surface Definition. No cloned builder.
 *
 * Persistence is preview-only (in-memory) for headers in this slice — clearly labeled.
 * The header runtime placement wiring (metric_placements surface=workspace_header /
 * work_unit_header) is a follow-up; nothing here pretends to save.
 */

import { useMemo } from "react";

import { SurfaceBuilder } from "@/components/platform/surfaceBuilder/SurfaceBuilder";
import { createMemoryPersistence } from "@/lib/platform/surfaceBuilder/memoryPersistence";
import {
    workspaceHeaderSurfaceDefinition,
    workUnitHeaderSurfaceDefinition,
    WORKSPACE_HEADER_TEMPLATE,
    WORK_UNIT_HEADER_TEMPLATE,
} from "@/lib/platform/surfaceBuilder/definitions/headerSurfaceDefinitions";

function HeaderShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-2" data-header-surface-builder>
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-alloy-midnight/70">
                <span className="font-semibold text-amber-600">Preview persistence</span> — header changes aren’t saved yet (in-memory). Runtime placement wiring is next.
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-alloy-stone/15 bg-white">{children}</div>
        </div>
    );
}

export function WorkspaceHeaderSurfaceBuilder() {
    const definition = useMemo(
        () => workspaceHeaderSurfaceDefinition(createMemoryPersistence(WORKSPACE_HEADER_TEMPLATE)),
        [],
    );
    return <HeaderShell><SurfaceBuilder definition={definition} /></HeaderShell>;
}

export function WorkUnitHeaderSurfaceBuilder() {
    const definition = useMemo(
        () => workUnitHeaderSurfaceDefinition(createMemoryPersistence(WORK_UNIT_HEADER_TEMPLATE)),
        [],
    );
    return <HeaderShell><SurfaceBuilder definition={definition} /></HeaderShell>;
}
