"use client";

/**
 * Presentation Runtime V2 — the root of the presentation tree
 * (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Routes mount this and nothing else: `/workspace` → WorkspaceSurface,
 * `/workspace/work-unit/:slug` → WorkUnitSurface (identity provided by the slug route
 * host). Each surface resolves its models through the runtime hooks; everything below
 * this component is pure presentation.
 */

import { WorkspaceSurface } from "@/components/presentation/workspace";

export type PresentationSurface = "workspace" | "work-unit";

export function PresentationRuntime({ surface }: { surface: PresentationSurface }) {
    // The Work Unit surface is owned by the Surface Host and rendered from COMMITTED FOCUS
    // (ProvisionedWorkUnitSurface). The route no longer mounts it: a route may be a direct-link
    // entry, a reload boundary and a URL representation — never the owner of reveal.
    if (surface === "work-unit") return null;
    return <WorkspaceSurface />;
}
