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

    // The platform SurfaceBuilder owns its toolbar (title, modes, publish, Open runtime).
    return (
        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-alloy-stone/15 bg-white" data-oi-surface-builder>
            <SurfaceBuilder definition={definition} />
        </div>
    );
}
