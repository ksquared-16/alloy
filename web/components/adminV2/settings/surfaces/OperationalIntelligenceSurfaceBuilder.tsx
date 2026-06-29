"use client";

/**
 * Operational Intelligence in the Surface Builder — Settings → Surfaces → Operational
 * Intelligence opens THIS, the one platform SurfaceBuilder, with the OI Surface
 * Definition. No Analytics-specific builder, no wizard.
 *
 * Persistence is REAL: the builder loads live metric_placements and Publish writes them
 * back, so the Workspace → Analytics modal reflects the change.
 */

import { useMemo } from "react";

import { SurfaceBuilder } from "@/components/platform/surfaceBuilder/SurfaceBuilder";
import { createOperationalIntelligencePersistence } from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceClientPersistence";
import { operationalIntelligenceSurfaceDefinition } from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition";

export default function OperationalIntelligenceSurfaceBuilder() {
    const definition = useMemo(
        () => operationalIntelligenceSurfaceDefinition(createOperationalIntelligencePersistence()),
        [],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-2" data-oi-surface-builder>
            <div className="flex items-center gap-2 px-1 text-[11px] text-alloy-midnight/55">
                <span>Editing the live Operational Intelligence surface. Publish writes to the runtime.</span>
                <a href="/workspace?workspaceModal=analytics" className="ml-auto font-semibold text-alloy-pine hover:underline">
                    Open in Workspace →
                </a>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-alloy-stone/15 bg-white">
                <SurfaceBuilder definition={definition} />
            </div>
        </div>
    );
}
