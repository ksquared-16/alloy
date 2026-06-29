"use client";

/**
 * Operational Intelligence in the Surface Builder — Settings → Surfaces → Operational
 * Intelligence opens THIS, the one platform SurfaceBuilder, with the OI Surface
 * Definition. No Analytics-specific builder, no wizard.
 *
 * Persistence is the temporary in-memory adapter (clearly labeled). The real
 * metric_placements adapter is the next slice; nothing here pretends to save.
 */

import { useMemo } from "react";

import { SurfaceBuilder } from "@/components/platform/surfaceBuilder/SurfaceBuilder";
import { createMemoryPersistence } from "@/lib/platform/surfaceBuilder/memoryPersistence";
import { operationalIntelligenceSurfaceDefinition } from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

/** A starter surface so the canvas shows real cards immediately (mirrors the seeded OI placements). */
const STARTER_DOC: SurfaceDoc = {
    sections: [
        {
            sectionId: "operational-pulse",
            title: "Operational Pulse",
            cards: [
                { instanceId: "seed-lead", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: {}, promotedTo: ["operational_intelligence"] },
                { instanceId: "seed-tour", cardTypeKey: "trend", contentId: "enrollment.tour_conversion_rate", config: { rendererKey: "trend_card" }, promotedTo: ["operational_intelligence", "workspace_header"] },
                { instanceId: "seed-attn", cardTypeKey: "kpi", contentId: "ops.needs_attention_count", config: {}, promotedTo: ["operational_intelligence"] },
                { instanceId: "seed-overdue", cardTypeKey: "kpi", contentId: "ops.work_overdue_count", config: {}, promotedTo: ["operational_intelligence"] },
            ],
        },
    ],
};

export default function OperationalIntelligenceSurfaceBuilder() {
    const definition = useMemo(
        () => operationalIntelligenceSurfaceDefinition(createMemoryPersistence(STARTER_DOC)),
        [],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-2" data-oi-surface-builder>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-alloy-midnight/70">
                <span className="font-semibold text-amber-700">Preview persistence</span>
                — changes are not saved yet (temporary in-memory). The metric_placements adapter lands next.
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
